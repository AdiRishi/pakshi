import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { edit, newSite, publish, readyPage, served } from "./support/sites.ts";
import { setUp, studio } from "./support/studio.ts";

const admin = Effect.cached(
  setUp({
    organization: "Riverton Council",
    name: "Priya Shah",
    email: "priya@riverton.test",
    password: "priya-password",
  }),
).pipe(Effect.runSync);

it.live(
  "a brand's new look reaches each of its sites as a Brand update draft, not its live pages",
  () =>
    Effect.gen(function* () {
      const priya = yield* studio(yield* admin);
      const live = yield* newSite(priya, "Northbank Libraries", "northbank");
      yield* edit(priya, live.site, live.draft, readyPage(live.home, "Welcome"));
      yield* publish(priya, live.site, live.draft);
      const brand = live.brand;
      const other = yield* priya.createSite({ brand, name: "Library Events", address: "events" });

      const { look, revision } = yield* priya.brand({ brand });
      const pale = { ...look, theme: { ...look.theme, brandColor: "#ffe14d" } };
      const refused = yield* Effect.flip(
        priya.saveBrandLook({ brand, look: pale, seen: revision.number }),
      );
      expect(refused._tag).toBe("ThemeUnreadable");

      const plum = { ...look, theme: { ...look.theme, brandColor: "#7a1f5c" } };
      const saved = yield* priya.saveBrandLook({ brand, look: plum, seen: revision.number });
      expect(saved.revision.number).toBe(2);
      expect(saved.sites.map(({ site, draft }) => [site.name, draft?.name])).toEqual(
        expect.arrayContaining([
          ["Northbank Libraries", "Brand update"],
          ["Library Events", "Brand update"],
        ]),
      );
      expect((yield* served("northbank"))?.manifest?.brand.number).toBe(1);

      const { drafts } = yield* priya.siteDrafts({ site: other.site.id });
      expect(drafts.map(({ kind }) => kind._tag)).toEqual(expect.arrayContaining(["BrandUpdate"]));
    }).pipe(Effect.scoped),
);
