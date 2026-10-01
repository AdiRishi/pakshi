import { expect, it } from "@effect/vitest";
import { Hostname } from "@repo/contracts/studio";
import { Effect, Schema } from "effect";

import { newSite, served } from "./support/sites.ts";
import { join, setUp, studio } from "./support/studio.ts";

const admin = Effect.cached(
  setUp({
    organization: "Riverton Council",
    name: "Priya Shah",
    email: "priya@riverton.test",
    password: "priya-password",
  }),
).pipe(Effect.runSync);

it.live(
  "a deleted site stops serving at once and releases its domains, and an org admin can restore it",
  () =>
    Effect.gen(function* () {
      const priya = yield* studio(yield* admin);
      const site = yield* newSite(priya, "Northbank Libraries", "northbank");
      const rooms = yield* Schema.decodeEffect(Hostname)("rooms.northbank.localhost");
      yield* priya.addDomain({ site: site.site, hostname: rooms });
      yield* priya.checkDomains({ site: site.site });

      yield* priya.deleteSite({ site: site.site });
      expect(yield* served("northbank")).toBeNull();
      expect((yield* priya.viewer()).sites.map(({ id }) => id)).not.toContain(site.site);
      expect((yield* Effect.flip(priya.siteDrafts({ site: site.site })))._tag).toBe("SiteNotFound");
      expect(yield* priya.deletedSites()).toMatchObject([
        { id: site.site, name: "Northbank Libraries", deletedBy: "Priya Shah" },
      ]);
      const other = yield* newSite(priya, "Library Events", "events");
      yield* priya.addDomain({ site: other.site, hostname: rooms });

      yield* priya.restoreSite({ site: site.site });
      expect((yield* served("northbank"))?.site).toBe(site.site);
      expect((yield* priya.siteDomains({ site: site.site })).domains).toEqual([]);
    }),
);

it.live("only someone who may delete a site can, and a brand goes only once it has no sites", () =>
  Effect.gen(function* () {
    const priya = yield* studio(yield* admin);
    const site = yield* newSite(priya, "Riverside Parks", "parks");
    const sam = yield* studio(
      yield* join(priya, { name: "Sam Okafor", email: "sam@riverton.test" }, "editor", {
        kind: "site",
        id: site.site,
      }),
    );
    expect((yield* Effect.flip(sam.deleteSite({ site: site.site })))._tag).toBe("NotPermitted");
    expect(yield* sam.deletedSites()).toEqual([]);

    const busy = yield* Effect.flip(priya.deleteBrand({ brand: site.brand }));
    expect(busy).toMatchObject({ _tag: "BrandHasSites", sites: 1 });
    yield* priya.deleteSite({ site: site.site });
    // A deleted site can still be restored, so its brand stays.
    expect((yield* Effect.flip(priya.deleteBrand({ brand: site.brand })))._tag).toBe(
      "BrandHasSites",
    );
  }),
);
