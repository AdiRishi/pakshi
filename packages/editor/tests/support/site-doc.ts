import { loadBlocks } from "@repo/blocks";
import { blockFixtures, fixtureSite, fixtureTree, flattenTree } from "@repo/blocks/fixtures";
import { Draft } from "@repo/contracts/draft";
import { BatchId, randomId, type TurnId } from "@repo/contracts/ids";
import type {
  ClientMessage,
  Collaborator,
  CommittedBatch,
  Peer,
  Presence,
  ServerMessage,
} from "@repo/contracts/live";
import type { Op } from "@repo/contracts/ops";
import { commitBatch, type Writes } from "@repo/domain/commit";
import { harbour } from "@repo/tokens";
import { Schema } from "effect";

import type { Connection } from "../../src/store.ts";

const lockfile = Object.fromEntries(blockFixtures.map((entry) => [entry.type, entry.version]));

const definitionsOf = await loadBlocks(lockfile);
const placed = (placement: string) =>
  blockFixtures.filter((entry) => definitionsOf.get(entry.type)?.placement === placement);

const sections = placed("section").map(fixtureTree);
const [header] = placed("header").map(fixtureTree);
const [footer] = placed("footer").map(fixtureTree);
if (header === undefined || footer === undefined)
  throw new Error("Blocks need header and footer fixtures.");

/** A draft whose home page holds every section fixture, under a header and footer from their fixtures. */
export const fixtureDraft = Schema.decodeSync(Draft)({
  id: "dr_fixtures",
  site: "site_fixtures",
  base: { release: "rel_fixtures", snapshot: "snap_fixtures" },
  revision: 0,
  settings: fixtureSite.settings,
  parts: {
    header: header.id,
    footer: footer.id,
    blocks: Object.fromEntries([header, footer].flatMap(flattenTree)),
    menus: fixtureSite.menus,
  },
  forms: fixtureSite.forms,
  lockfile,
  theme: harbour,
  pages: {
    pg_home: {
      schema: "pakshi.page/1",
      id: "pg_home",
      type: "page",
      path: "/",
      meta: { title: "Home", description: "" },
      root: sections.map((section) => section.id),
      blocks: Object.fromEntries(sections.flatMap(flattenTree)),
    },
  },
});

export const definitions = definitionsOf;

export const meera: Collaborator = { id: "user_meera", name: "Meera Kapoor" };
export const sam: Collaborator = { id: "user_sam", name: "Sam Okafor" };

/** What travels to an editor: its connection opening or dropping, or a message. */
type ToClient =
  | { readonly kind: "open" }
  | { readonly kind: "close" }
  | { readonly kind: "message"; readonly message: ServerMessage };

interface Socket {
  readonly id: string;
  readonly person: Collaborator;
  readonly events: Parameters<Connection["open"]>[0];
  toServer: Array<ClientMessage>;
  toClient: Array<ToClient>;
  open: boolean;
  closed: boolean;
  presence: Presence | null;
}

/**
 * SiteDoc as editors see it over their live connections. It commits batches
 * with the real commit function, applies a batch ID once, answers Sync from
 * its log of committed batches, and relays presence. Messages wait in queues
 * the test runs: `deliver` runs them all, and `step` runs one chosen queue's
 * next message, for tests that interleave several editors.
 */
export const fakeSiteDoc = (options: { readonly draft?: Draft; readonly auto?: boolean } = {}) => {
  let draft = options.draft ?? fixtureDraft;
  let writes: Writes = new Map();
  const log: Array<CommittedBatch> = [];
  const known = new Map<BatchId, number>();
  const sockets: Array<Socket> = [];
  const auto = options.auto ?? true;
  let scheduled = false;

  const live = () => sockets.filter((socket) => socket.open && !socket.closed);

  const peerOf = (socket: Socket): Peer => ({
    connection: socket.id,
    person: socket.person,
    agent: false,
    presence: socket.presence,
  });

  const toClient = (socket: Socket, message: ServerMessage) =>
    socket.toClient.push({ kind: "message", message });

  const broadcast = (message: ServerMessage, without?: Socket) => {
    for (const socket of live()) if (socket !== without) toClient(socket, message);
  };

  const commit = (
    actor: Collaborator,
    batch: Parameters<typeof commitBatch>[3],
    turn: TurnId | null = null,
  ) => {
    const earlier = known.get(batch.id);
    if (earlier !== undefined) return { status: "known", revision: earlier } as const;
    const result = commitBatch(
      draft,
      writes,
      turn === null ? actor.id : `agent:${turn}`,
      batch,
      definitions,
    );
    if (!result.ok) return { status: "rejected", errors: result.errors } as const;
    draft = result.draft;
    writes = result.writes;
    const committed = {
      id: batch.id,
      revision: draft.revision,
      actor,
      turn,
      ops: result.ops,
    };
    log.push(committed);
    known.set(batch.id, draft.revision);
    broadcast({
      _tag: "Committed",
      batch: committed,
      skipped: result.skipped,
      replaced: result.replaced.map(({ actor: person, op }) => ({ person, op })),
    });
    return { status: "committed" } as const;
  };

  const handle = (socket: Socket, message: ClientMessage) => {
    switch (message._tag) {
      case "Sync":
        toClient(socket, {
          _tag: "Synced",
          catchUp:
            message.revision > draft.revision
              ? { _tag: "Draft", draft }
              : {
                  _tag: "Batches",
                  batches: log.filter((batch) => batch.revision > message.revision),
                },
          peers: live()
            .filter((other) => other !== socket)
            .map(peerOf),
        });
        return;
      case "Batch": {
        const result = commit(socket.person, message.batch);
        if (result.status === "known")
          toClient(socket, { _tag: "Known", batch: message.batch.id, revision: result.revision });
        if (result.status === "rejected")
          toClient(socket, { _tag: "Rejected", batch: message.batch.id, errors: result.errors });
        return;
      }
      case "Presence":
        socket.presence = message.presence;
        broadcast({ _tag: "PeerChanged", peer: peerOf(socket) }, socket);
    }
  };

  /** Hands an editor the next thing waiting for it. */
  const arrive = (socket: Socket) => {
    const item = socket.toClient.shift();
    if (item === undefined) return;
    if (item.kind === "open") {
      socket.open = true;
      broadcast({ _tag: "PeerChanged", peer: peerOf(socket) }, socket);
      socket.events.onOpen();
    } else if (item.kind === "close") socket.events.onClose();
    else socket.events.onMessage(item.message);
  };

  /** The queues with something waiting, each with how to run its next item. */
  const ready = () =>
    sockets.flatMap((socket) => [
      ...(socket.toServer.length > 0 && socket.open && !socket.closed
        ? [
            () => {
              const message = socket.toServer.shift();
              if (message !== undefined) handle(socket, message);
            },
          ]
        : []),
      ...(socket.toClient.length > 0 && !socket.closed ? [() => arrive(socket)] : []),
    ]);

  /** Runs every waiting message, including the ones running them sends, until none are left. */
  const deliver = () => {
    for (let next = ready(); next.length > 0; next = ready()) for (const run of next) run();
  };

  const schedule = () => {
    if (!auto || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      deliver();
    });
  };

  const connection = (person: Collaborator): Connection => ({
    open: (events) => {
      const socket: Socket = {
        id: randomId("conn"),
        person,
        events,
        toServer: [],
        toClient: [{ kind: "open" }],
        open: false,
        closed: false,
        presence: null,
      };
      sockets.push(socket);
      schedule();
      return {
        send: (message) => {
          // Like the real socket, nothing sent while the connection is down is kept.
          if (!socket.open || socket.closed) return;
          socket.toServer.push(message);
          schedule();
        },
        close: () => {
          socket.closed = true;
          if (socket.open) broadcast({ _tag: "PeerLeft", connection: socket.id }, socket);
          schedule();
        },
      };
    },
  });

  return {
    connection,
    /** Commits a batch SiteDoc makes itself, such as a merge, as if `actor` made it. */
    commitFromSite: (actor: Collaborator, batch: Parameters<typeof commitBatch>[3]) => {
      commit(actor, batch);
      schedule();
    },
    /** Commits a batch the agent made for `actor` in one turn of their conversation. */
    commitFromAgent: (
      actor: Collaborator,
      turn: TurnId,
      batch: Parameters<typeof commitBatch>[3],
    ) => {
      commit(actor, batch, turn);
      schedule();
    },
    /** Sends everyone connected a message, such as news of a release going live. */
    announce: (message: ServerMessage) => {
      broadcast(message);
      schedule();
    },
    /** The draft as SiteDoc has it. */
    draft: () => draft,
    /** Every batch SiteDoc committed, in order. */
    log: () => log,
    deliver,
    /** Delivers what's waiting for the editors, and nothing that's waiting for SiteDoc. */
    receive: () => {
      for (const socket of sockets)
        while (socket.toClient.length > 0 && !socket.closed) arrive(socket);
    },
    /** Runs the next item of one waiting queue, chosen by `pick`, and says whether any was waiting. */
    step: (pick: number) => {
      const next = ready();
      const run = next[pick % Math.max(next.length, 1)];
      run?.();
      return run !== undefined;
    },
    /**
     * Drops a person's connections, losing whatever was on its way in either
     * direction, and reconnects them, as a network failure would.
     */
    drop: (person: Collaborator) => {
      for (const socket of live().filter((candidate) => candidate.person.id === person.id)) {
        socket.open = false;
        socket.toServer = [];
        socket.toClient = [{ kind: "close" }, { kind: "open" }];
        broadcast({ _tag: "PeerLeft", connection: socket.id }, socket);
      }
      schedule();
    },
    /** Commits ops as someone without an editor open, as Studio's page list does. */
    commit: (actor: Collaborator, ops: ReadonlyArray<Op>) => {
      const result = commit(actor, { id: BatchId.make(randomId("bat")), ops });
      schedule();
      return result;
    },
    /** Every message sent to SiteDoc so far that's still waiting, for tests that inspect them. */
    waiting: () => sockets.flatMap((socket) => socket.toServer),
  };
};

export type FakeSiteDoc = ReturnType<typeof fakeSiteDoc>;
