import { expect, it } from "@effect/vitest";
import { routingKeys, snapshotReader } from "@repo/contracts/snapshot";
import { runDurableObjectAlarm } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { Effect } from "effect";

import { edit, newSite, publish, readyPage, served, textSection } from "./support/sites.ts";
import { setUp, studio } from "./support/studio.ts";

const admin = Effect.cached(
  setUp({
    organization: "Riverton Council",
    name: "Priya Shah",
    email: "priya@riverton.test",
    password: "priya-password",
  }),
).pipe(Effect.runSync);

const snapshots = snapshotReader(async (key) => (await env.CONTENT.get(key))?.text() ?? null);

/** The headings of the sections on a site's live home page, top to bottom. */
const liveHeadings = (address: string) =>
  Effect.gen(function* () {
    const live = yield* served(address);
    const entry = live?.manifest?.pages.find((page) => page.path === "/");
    if (live === null || entry === undefined) return [];
    const page = yield* Effect.promise(() => snapshots.page(live.site, entry.object));
    return page.root.map((id) => page.blocks[id]?.props["heading"]);
  });

it.live("a new site answers at its subdomain at once, and its first publish serves its page", () =>
  Effect.gen(function* () {
    const client = yield* studio(yield* admin);
    const { site, draft, home } = yield* newSite(client, "Northbank Libraries", "northbank");

    const before = yield* served("northbank");
    expect(before?.site).toBe(site);
    expect(before?.manifest?.pages).toEqual([]);

    yield* edit(client, site, draft, readyPage(home, "Welcome to Northbank"));
    const release = yield* publish(client, site, draft);
    expect((yield* served("northbank"))?.live?.release).toBe(release.id);
    expect(yield* liveHeadings("northbank")).toEqual(["Welcome to Northbank"]);
  }).pipe(Effect.scoped),
);

it.live(
  "a draft behind the live site takes the newer release in, and a rollback undoes the latest publish",
  () =>
    Effect.gen(function* () {
      const client = yield* studio(yield* admin);
      const { site, draft, home } = yield* newSite(client, "Library Events", "events");
      yield* edit(client, site, draft, readyPage(home, "Events"));
      yield* publish(client, site, draft);

      const hours = yield* client.createDraft({ site, name: "Opening hours" });
      const talks = yield* client.createDraft({ site, name: "Author talks" });
      const add = (heading: string) =>
        ({
          op: "insertBlock",
          page: home,
          list: "root",
          after: null,
          block: textSection(heading),
        }) as const;
      yield* edit(client, site, hours.id, [add("Opening hours")]);
      yield* edit(client, site, talks.id, [add("Author talks")]);
      yield* publish(client, site, hours.id);
      // Submitting a draft that's behind merges the live release in first, when no one needs to decide.
      const latest = yield* publish(client, site, talks.id);
      expect(yield* liveHeadings("events")).toEqual(["Opening hours", "Author talks", "Events"]);

      const rolledBack = yield* client.rollBack({ site });
      expect(rolledBack).toMatchObject({ _tag: "RolledBack", undid: latest.id });
      expect(yield* liveHeadings("events")).toEqual(["Opening hours", "Events"]);
    }).pipe(Effect.scoped),
);

it.live("the reconcile job puts back a live release KV lost", () =>
  Effect.gen(function* () {
    const client = yield* studio(yield* admin);
    const { site, draft, home } = yield* newSite(client, "Riverside Branch", "riverside");
    yield* edit(client, site, draft, readyPage(home, "Riverside"));
    const release = yield* publish(client, site, draft);
    // The outbox copies the release to D1, which the job compares KV with.
    yield* Effect.promise(() =>
      runDurableObjectAlarm(env.SITE_DOC.get(env.SITE_DOC.idFromName(site))),
    );
    yield* Effect.promise(() => env.ROUTING.delete(routingKeys.site(site)));

    yield* Effect.promise(() => exports.default.scheduled());
    expect((yield* served("riverside"))?.live?.release).toBe(release.id);
  }).pipe(Effect.scoped),
);
