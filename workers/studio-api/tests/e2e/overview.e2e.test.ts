import { expect, it } from "@effect/vitest";
import { Hostname } from "@repo/contracts/studio";
import { testSitesHost } from "@repo/infra/test-bindings";
import { Effect, Schema } from "effect";

import { edit, newSite, publish, readyPage } from "./support/sites.ts";
import { join, setUp, studio } from "./support/studio.ts";

const admin = Effect.cached(
  setUp({
    organization: "Riverton Council",
    name: "Priya Shah",
    email: "priya@riverton.test",
    password: "priya-password",
  }),
).pipe(Effect.runSync);

const domain = Schema.decodeSync(Hostname)("www.northbank.localhost");

it.live(
  "a site's overview gives its addresses, and its home page once its first publish is live",
  () =>
    Effect.gen(function* () {
      const priya = yield* studio(yield* admin);
      const { site, draft, home } = yield* newSite(priya, "Northbank Libraries", "northbank");

      const unpublished = yield* priya.siteOverview({ site });
      expect(unpublished.live._tag).toBe("Created");
      expect(unpublished.home).toBeNull();
      expect(unpublished.addresses).toEqual({
        own: null,
        pakshi: `http://northbank.${testSitesHost}`,
      });
      expect(unpublished.editing).toEqual({
        openDrafts: 1,
        waitingDrafts: 0,
        blockUpdates: 0,
        brandUpdate: null,
      });

      yield* edit(priya, site, draft, readyPage(home, "Welcome to Northbank"));
      const release = yield* publish(priya, site, draft);
      yield* priya.addDomain({ site, hostname: domain });
      yield* priya.checkDomains({ site });

      const live = yield* priya.siteOverview({ site });
      expect(live.live.id).toBe(release.id);
      expect(live.home?.page?.path).toBe("/");
      expect(live.addresses.own).toBe(`http://${domain}`);
      expect(live.editing?.openDrafts).toBe(0);
    }),
);

it.live("a site's overview counts only what waits in the tabs the person may open", () =>
  Effect.gen(function* () {
    const priya = yield* studio(yield* admin);
    const { site } = yield* newSite(priya, "Riverside Parks", "parks");
    const other = yield* newSite(priya, "Library Events", "events");
    const place = { kind: "site", id: site } as const;

    const sam = yield* studio(
      yield* join(priya, { name: "Sam Okafor", email: "sam@riverton.test" }, "editor", place),
    );
    const editing = yield* sam.siteOverview({ site });
    expect(editing.editing?.openDrafts).toBe(1);
    expect(editing.newEntries).toBeNull();

    const ama = yield* studio(
      yield* join(
        priya,
        { name: "Ama Mensah", email: "ama@riverton.test" },
        "submissions-viewer",
        place,
      ),
    );
    const reading = yield* ama.siteOverview({ site });
    expect(reading.editing).toBeNull();
    expect(reading.newEntries).toBe(0);

    const kofi = yield* studio(
      yield* join(priya, { name: "Kofi Boateng", email: "kofi@riverton.test" }, "editor", {
        kind: "site",
        id: other.site,
      }),
    );
    const refused = yield* Effect.flip(kofi.siteOverview({ site }));
    expect(refused._tag).toBe("SiteNotFound");
  }),
);
