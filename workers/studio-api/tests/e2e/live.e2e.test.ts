import { expect, it } from "@effect/vitest";
import { BatchId, randomId } from "@repo/contracts/ids";
import {
  ClientMessageJson,
  liveBasePath,
  ServerMessage,
  ServerMessageJson,
} from "@repo/contracts/live";
import { Effect, Schema } from "effect";

import { newSite, textSection } from "./support/sites.ts";
import { openSocket } from "./support/sockets.ts";
import { join, setUp, studio } from "./support/studio.ts";

const admin = Effect.cached(
  setUp({
    organization: "Riverton Council",
    name: "Priya Shah",
    email: "priya@riverton.test",
    password: "priya-password",
  }),
).pipe(Effect.runSync);

const encode = Schema.encodeSync(ClientMessageJson);
const { guards } = ServerMessage;

/** Accepts a message the guard recognises. */
const when =
  <A extends ServerMessage>(guard: (message: ServerMessage) => message is A) =>
  (message: ServerMessage) =>
    guard(message) ? message : undefined;

const live = (path: string, session: string | undefined, headers?: Record<string, string>) =>
  openSocket(ServerMessageJson, path, session, headers);

/** A site with a draft, and someone besides its admin invited to work on it. */
const draftWithTwoPeople = (address: string, role: "editor" | "approver") =>
  Effect.gen(function* () {
    const priya = yield* admin;
    const client = yield* studio(priya);
    const created = yield* newSite(client, `Site ${address}`, address);
    const other = yield* join(
      client,
      { name: "Sam Okafor", email: `sam-${address}@riverton.test` },
      role,
      { kind: "site", id: created.site },
    );
    return {
      ...created,
      client,
      priya,
      other,
      path: `${liveBasePath}/${created.site}/${created.draft}`,
    };
  });

it.live("two people in one draft see each other's changes, in the order SiteDoc commits them", () =>
  Effect.gen(function* () {
    const { path, priya, other, home } = yield* draftWithTwoPeople("northbank", "editor");
    const mine = yield* live(path, priya);
    const theirs = yield* live(path, other);
    for (const socket of [mine, theirs]) {
      socket.send(encode({ _tag: "Sync", revision: 0 }));
      yield* socket.next(when(guards.Synced));
    }
    const batch = {
      id: BatchId.make(randomId("bat")),
      ops: [
        { op: "insertBlock", page: home, list: "root", after: null, block: textSection("Hours") },
      ] as const,
    };
    theirs.send(encode({ _tag: "Batch", batch }));
    const { batch: seen } = yield* mine.next(when(guards.Committed));
    expect(seen).toMatchObject({ id: batch.id, actor: { name: "Sam Okafor" } });
    // Sending a batch again, as an editor does after reconnecting, changes nothing.
    theirs.send(encode({ _tag: "Batch", batch }));
    expect((yield* theirs.next(when(guards.Known))).revision).toBe(seen.revision);
  }).pipe(Effect.scoped),
);

it.live(
  "a live connection opens only from Studio, signed in, for someone who may edit the draft",
  () =>
    Effect.gen(function* () {
      const { path, priya, other } = yield* draftWithTwoPeople("events", "approver");
      expect((yield* live(path, priya, { origin: "https://evil.test" })).status).toBe(403);
      expect((yield* live(path, undefined)).status).toBe(401);
      // An approver reviews submissions; they don't edit drafts unless one is shared with them.
      expect((yield* live(path, other)).status).toBe(404);
    }).pipe(Effect.scoped),
);

it.live("someone a draft is shared with for editing is let go when the share ends", () =>
  Effect.gen(function* () {
    const { client, site, draft, path, other } = yield* draftWithTwoPeople("parks", "approver");
    const sam = yield* (yield* studio(other)).viewer();
    const share = (access: "edit" | null) =>
      client.shareDraft({
        site,
        draft,
        sharing: {
          people:
            access === null
              ? []
              : [
                  {
                    person: { id: sam.user.id, name: sam.user.name, email: sam.user.email },
                    access,
                  },
                ],
          general: { audience: "people", access: "view" },
        },
      });
    yield* share("edit");
    const socket = yield* live(path, other);
    socket.send(encode({ _tag: "Sync", revision: 0 }));
    yield* socket.next(when(guards.Synced));

    yield* share(null);
    yield* socket.next(when(guards.AccessEnded));
    expect(yield* socket.closed).toBe(1008);
    expect((yield* live(path, other)).status).toBe(404);
  }).pipe(Effect.scoped),
);
