import { SqliteClient } from "@effect/sql-sqlite-do";
import type { Draft } from "@repo/contracts/draft";
import { SiteId } from "@repo/contracts/ids";
import {
  ClientMessage,
  ClientMessageJson,
  Collaborator,
  type Peer,
  Presence,
  ServerMessage,
  ServerMessageJson,
} from "@repo/contracts/live";
import type { Batch } from "@repo/contracts/ops";
import { LiveRelease, routingKeys, snapshotReader } from "@repo/contracts/snapshot";
import type { BatchOutcome } from "@repo/contracts/studio";
import { Permission } from "@repo/domain/access";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Effect, Layer, ManagedRuntime, Option, Schema } from "effect";
import type { SqlError } from "effect/unstable/sql";
import * as Migrator from "effect/unstable/sql/Migrator";
import { type Connection, type ConnectionContext, Server, type WSMessage } from "partyserver";

import { type LiveSnapshot, migrations, SiteDrafts, SiteSource } from "./drafts.ts";

/** Who a live connection is for, as studio-api found them when it checked their session. */
export const LiveAuthorization = Schema.Struct({
  person: Collaborator,
  /** What the person may do on this site, which every batch they send is checked against. */
  permissions: Schema.Array(Permission),
});
export type LiveAuthorization = typeof LiveAuthorization.Type;

/** The header studio-api passes a live connection's authorization in. Only studio-api reaches SiteDoc. */
export const liveAuthorizationHeader = "x-pakshi-live";

const decodeAuthorization = Schema.decodeUnknownOption(Schema.fromJsonString(LiveAuthorization));
const decodeMessage = Schema.decodeUnknownOption(ClientMessageJson);
const encodeMessage = Schema.encodeSync(ServerMessageJson);

/** What SiteDoc keeps on each connection. It lives in the socket's attachment, so it survives hibernation. */
interface LiveState extends LiveAuthorization {
  readonly presence: Presence | null;
}

type LiveConnection = Connection<LiveState>;

/** The site's live release, its snapshot and every page in it, read from KV and R2. */
const readLiveSnapshot = async (env: StudioApiEnv, site: SiteId): Promise<LiveSnapshot> => {
  const value = await env.ROUTING.get(routingKeys.site(site));
  if (value === null) throw new Error(`${site} has no live release to start a draft from.`);
  const live = Schema.decodeSync(Schema.fromJsonString(LiveRelease))(value);
  const snapshots = snapshotReader(async (key) => (await env.CONTENT.get(key))?.text() ?? null);
  const manifest = await snapshots.manifest(site, live.snapshot);
  const pages = await Promise.all(manifest.pages.map((page) => snapshots.page(site, page.object)));
  return { live, manifest, pages };
};

/** A site's drafts over its SiteDoc's SQLite storage, with the storage schema applied first. */
const draftsRuntime = (storage: DurableObjectStorage, env: StudioApiEnv, site: SiteId) =>
  ManagedRuntime.make(
    SiteDrafts.layer.pipe(
      Layer.provide(Layer.effectDiscard(Migrator.make({})({ loader: migrations }))),
      Layer.provide(
        Layer.succeed(SiteSource)({
          site,
          liveSnapshot: Effect.promise(() => readLiveSnapshot(env, site)),
        }),
      ),
      Layer.provide(SqliteClient.layer({ storage })),
      Layer.orDie,
    ),
  );

/**
 * A site's drafts, submissions and live release, edited live by people and the agent.
 * Other code reaches it through PartyServer's `getServerByName`, named by site ID.
 *
 * Every live message and every commit runs one after another, in the order
 * they arrive, so each commit's broadcast leaves before the next commit starts.
 *
 * PartyServer requires its env to extend the global `Cloudflare.Env`. Other
 * Workers' programs include this file through the binding types and declare
 * their own global env, so the intersection keeps the constraint true in all of
 * them; in this Worker it is just StudioApiEnv.
 */
export class SiteDoc extends Server<StudioApiEnv & Cloudflare.Env> {
  static override options = { hibernate: true };

  #drafts: ReturnType<typeof draftsRuntime> | undefined;
  #queue: Promise<unknown> = Promise.resolve();

  #run<A>(
    use: (
      drafts: SiteDrafts["Service"],
    ) => Effect.Effect<A, SqlError.SqlError | Schema.SchemaError>,
  ) {
    this.#drafts ??= draftsRuntime(
      this.ctx.storage,
      this.env,
      Schema.decodeSync(SiteId)(this.name),
    );
    return this.#drafts.runPromise(SiteDrafts.use(use));
  }

  /** Runs a task after every task queued before it. */
  #serially<A>(task: () => Promise<A>): Promise<A> {
    const next = this.#queue.then(task);
    this.#queue = next.catch(() => undefined);
    return next;
  }

  #send(connection: LiveConnection, message: ServerMessage) {
    connection.send(encodeMessage(message));
  }

  #broadcast(message: ServerMessage, without: ReadonlyArray<string> = []) {
    this.broadcast(encodeMessage(message), [...without]);
  }

  #peerOf(connection: LiveConnection): Peer | null {
    const state = connection.state;
    return state === null
      ? null
      : { connection: connection.id, person: state.person, presence: state.presence };
  }

  /** Commits a batch and tells everyone connected, or returns why it can't commit. */
  async #commit(actor: Collaborator, batch: Batch) {
    const result = await this.#run((drafts) => drafts.applyBatch(actor, batch));
    if (result.status === "committed")
      this.#broadcast(ServerMessage.cases.Committed.make(result.commit));
    return result;
  }

  override onConnect(connection: LiveConnection, { request }: ConnectionContext) {
    const authorization = decodeAuthorization(request.headers.get(liveAuthorizationHeader));
    if (Option.isNone(authorization)) {
      connection.close(1008, "Not authorized");
      return;
    }
    connection.setState({ ...authorization.value, presence: null });
    const peer = this.#peerOf(connection);
    if (peer !== null)
      this.#broadcast(ServerMessage.cases.PeerChanged.make({ peer }), [connection.id]);
  }

  override onMessage(connection: LiveConnection, raw: WSMessage) {
    return this.#serially(async () => {
      const state = connection.state;
      const message = decodeMessage(raw);
      if (state === null || Option.isNone(message)) {
        connection.close(1003, "Unreadable message");
        return;
      }
      try {
        await ClientMessage.match(message.value, {
          Sync: async ({ revision }) => {
            const catchUp = await this.#run((drafts) => drafts.catchUp(revision));
            const peers = Array.from(this.getConnections<LiveState>()).flatMap((other) => {
              const peer = other.id === connection.id ? null : this.#peerOf(other);
              return peer === null ? [] : [peer];
            });
            this.#send(connection, ServerMessage.cases.Synced.make({ catchUp, peers }));
          },
          Batch: async ({ batch }) => {
            if (!state.permissions.includes("page.edit")) {
              const errors = [
                {
                  op: 0,
                  path: [],
                  rule: "permission" as const,
                  message: "You can no longer edit this draft.",
                },
              ];
              this.#send(
                connection,
                ServerMessage.cases.Rejected.make({ batch: batch.id, errors }),
              );
              return;
            }
            const result = await this.#commit(state.person, batch);
            if (result.status === "duplicate")
              this.#send(
                connection,
                ServerMessage.cases.Known.make({ batch: batch.id, revision: result.revision }),
              );
            if (result.status === "rejected")
              this.#send(
                connection,
                ServerMessage.cases.Rejected.make({ batch: batch.id, errors: result.errors }),
              );
          },
          Presence: async ({ presence }) => {
            connection.setState({ ...state, presence });
            const peer = this.#peerOf(connection);
            if (peer !== null)
              this.#broadcast(ServerMessage.cases.PeerChanged.make({ peer }), [connection.id]);
          },
        });
      } catch (error) {
        // The editor reconnects, catches up and sends what SiteDoc didn't confirm again.
        console.error("SiteDoc couldn't handle a live message", error);
        connection.close(1011, "Try again");
      }
    });
  }

  override onClose(connection: LiveConnection) {
    this.#broadcast(ServerMessage.cases.PeerLeft.make({ connection: connection.id }), [
      connection.id,
    ]);
  }

  /** The site's draft, started from the live release the first time it's opened. */
  async draft(): Promise<Draft> {
    return this.#serially(() => this.#run((drafts) => drafts.draft));
  }

  /** Commits a batch for a person whose permission studio-api has checked. */
  async applyBatch(actor: Collaborator, batch: Batch): Promise<BatchOutcome> {
    const result = await this.#serially(() => this.#commit(actor, batch));
    switch (result.status) {
      case "committed":
        return { status: "committed", revision: result.commit.batch.revision };
      case "duplicate":
        return { status: "committed", revision: result.revision };
      case "rejected":
        return { status: "rejected", errors: result.errors };
    }
  }
}
