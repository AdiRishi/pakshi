import { expect, it } from "@effect/vitest";
import {
  AgentClientMessageJson,
  AgentServerMessage,
  AgentServerMessageJson,
  agentBasePath,
} from "@repo/contracts/agent";
import { exports } from "cloudflare:workers";
import { Effect, Schema } from "effect";

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

const sync = Schema.encodeSync(AgentClientMessageJson)({ _tag: "Sync" });

const synced = (message: AgentServerMessage) =>
  AgentServerMessage.guards.Synced(message) ? message : undefined;

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
    const his = yield* openSocket(AgentServerMessageJson, path, sam, {
      [agentAuthorizationHeader]: forged,
    });
    his.send(sync);
    expect((yield* his.next(synced)).sources).toEqual([]);
    const hers = yield* openSocket(AgentServerMessageJson, path, session);
    hers.send(sync);
    expect((yield* hers.next(synced)).sources.map(({ name }) => name)).toEqual(["notes.md"]);
  }).pipe(Effect.scoped),
);
