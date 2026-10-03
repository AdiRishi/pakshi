import { expect, it } from "@effect/vitest";
import {
  agentBasePath,
  AgentClientMessageJson,
  agentEvents,
  Sources,
  TurnRecord,
  turnKey,
} from "@repo/contracts/agent";
import { PageId } from "@repo/contracts/ids";
import { exports } from "cloudflare:workers";
import { DateTime, Effect, Option, Schema } from "effect";

import { agentAuthorizationHeader } from "../../src/agent/services.ts";
import { newSite } from "./support/sites.ts";
import { openSocket } from "./support/sockets.ts";
import { join, setUp, studio, studioOrigin } from "./support/studio.ts";

const admin = Effect.cached(
  setUp({
    organization: "Riverton Council",
    name: "Priya Shah",
    email: "priya@riverton.test",
    password: "priya-password",
  }),
).pipe(Effect.runSync);

/** Attaches a Markdown document to a person's conversation in a draft. */
const attach = (path: string, session: string, origin = studioOrigin) =>
  Effect.promise(() => {
    const form = new FormData();
    form.set("file", new File(["# Notes\n\nFive days."], "notes.md", { type: "text/markdown" }));
    return exports.default.fetch(
      new Request(`${studioOrigin}${path}/sources`, {
        method: "POST",
        headers: { origin, cookie: session },
        body: form,
      }),
    );
  });

/** An AG-UI event SiteAgent sends, with the fields these tests read. */
const Event = Schema.fromJsonString(
  Schema.Struct({
    type: Schema.String,
    runId: Schema.optionalKey(Schema.String),
    metadata: Schema.optionalKey(
      Schema.Struct({ tanstack: Schema.Struct({ runId: Schema.optionalKey(Schema.String) }) }),
    ),
    name: Schema.optionalKey(Schema.String),
    value: Schema.optionalKey(Schema.Json),
    messages: Schema.optionalKey(
      Schema.Array(
        Schema.Struct({
          role: Schema.String,
          content: Schema.optionalKey(Schema.NullOr(Schema.String)),
          metadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
        }),
      ),
    ),
  }),
);
type Event = typeof Event.Type;

const encodeMessage = Schema.encodeSync(AgentClientMessageJson);
const decodeSources = Schema.decodeUnknownOption(Sources);
const decodeRecord = Schema.decodeUnknownOption(TurnRecord);

/** The documents attached to the conversation, as it says when a connection opens or one is added. */
const sources = (event: Event) =>
  event.type === "CUSTOM" && event.name === agentEvents.sources
    ? Option.getOrUndefined(decodeSources(event.value))
    : undefined;

/** How the person's last message's turn stands, in a snapshot of the conversation. */
const turnIn = (event: Event) => {
  if (event.type !== "MESSAGES_SNAPSHOT") return undefined;
  const message = event.messages?.findLast((found) => found.role === "user");
  return Option.getOrUndefined(decodeRecord(message?.metadata?.[turnKey]));
};

it.live("the agent route reaches only the signed-in person's own conversation", () =>
  Effect.gen(function* () {
    const session = yield* admin;
    const priya = yield* studio(session);
    const { site, draft } = yield* newSite(priya, "Northbank Libraries", "northbank");
    const path = `${agentBasePath}/${site}/${draft}`;
    const sam = yield* join(priya, { name: "Sam Okafor", email: "sam@riverton.test" }, "editor", {
      kind: "site",
      id: site,
    });

    // A path aimed at another Durable Object, a made-up draft or another origin goes nowhere.
    expect((yield* attach(`${agentBasePath}/site-doc/${site}`, session)).status).toBe(404);
    expect((yield* attach(`${agentBasePath}/${site}/dr_madeup`, session)).status).toBe(404);
    expect((yield* attach(path, session, "https://evil.test")).status).toBe(403);
    expect((yield* attach(path, session)).ok).toBe(true);

    // Sam claims to be Priya in the header studio-api sets, and still reaches only his own.
    const { user } = yield* priya.viewer();
    const forged = JSON.stringify({
      person: user,
      site,
      brand: "brand_forged",
      draft,
      permissions: ["page.edit"],
      editsSite: true,
      studio: studioOrigin,
    });
    const his = yield* openSocket(Event, path, sam, {
      [agentAuthorizationHeader]: forged,
    });
    expect((yield* his.next(sources)).sources).toEqual([]);
    const hers = yield* openSocket(Event, path, session);
    expect((yield* hers.next(sources)).sources.map(({ name }) => name)).toEqual(["notes.md"]);
  }).pipe(Effect.scoped),
);

it.live(
  "a turn the gateway refuses ends as unavailable, followed by every connection to the conversation",
  () =>
    Effect.gen(function* () {
      const session = yield* admin;
      const priya = yield* studio(session);
      const { site, draft, home } = yield* newSite(priya, "Eastside Libraries", "eastside");
      const path = `${agentBasePath}/${site}/${draft}`;
      const laptop = yield* openSocket(Event, path, session);
      const phone = yield* openSocket(Event, path, session);
      yield* laptop.next(sources);
      yield* phone.next(sources);

      laptop.send(
        encodeMessage({
          _tag: "Send",
          run: "run_1",
          message: { id: "msg_1", text: "Make the heading shorter." },
          sources: [],
          page: PageId.make(home),
          selected: null,
          timeZone: DateTime.zoneMakeNamedUnsafe("Australia/Sydney"),
          builds: null,
        }),
      );
      for (const socket of [laptop, phone]) {
        expect(yield* socket.next(turnIn)).toMatchObject({ status: "working", undone: false });
        expect(
          yield* socket.next((event) => (event.type === "RUN_ERROR" ? event : undefined)),
        ).toMatchObject({ metadata: { tanstack: { runId: "run_1" } } });
        expect(yield* socket.next(turnIn)).toMatchObject({ status: "unavailable" });
      }

      // A connection opened later, such as a tab's that dropped while the
      // turn ran, gets the conversation as it ended, and the end of its run.
      const later = yield* openSocket(Event, path, session);
      expect(yield* later.next(turnIn)).toMatchObject({ status: "unavailable" });
      expect(
        yield* later.next((event) => (event.type === "RUN_FINISHED" ? event : undefined)),
      ).toMatchObject({ runId: "run_1" });
    }).pipe(Effect.scoped),
);
