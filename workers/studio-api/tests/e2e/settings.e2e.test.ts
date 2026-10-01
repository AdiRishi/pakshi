import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { edit, newSite, publish, readyPage, served } from "./support/sites.ts";
import { eventually, join, setUp, studio } from "./support/studio.ts";

const admin = Effect.cached(
  setUp({
    organization: "Riverton Council",
    name: "Priya Shah",
    email: "priya@riverton.test",
    password: "priya-password",
  }),
).pipe(Effect.runSync);

it.live(
  "a site renamed in its settings is renamed across Studio at once, and for visitors with the next publish",
  () =>
    Effect.gen(function* () {
      const priya = yield* studio(yield* admin);
      const site = yield* newSite(priya, "Northbank Libraries", "northbank");
      yield* edit(priya, site.site, site.draft, readyPage(site.home, "Welcome"));
      yield* publish(priya, site.site, site.draft);

      const before = yield* priya.siteSettings({ site: site.site });
      expect(before.settings.name).toBe("Northbank Libraries");
      const saved = yield* priya.saveSiteSettings({
        site: site.site,
        changes: { name: "Northbank Library Service" },
        seen: before.revision,
      });
      expect(saved.settings.name).toBe("Northbank Library Service");

      yield* eventually(
        Effect.flatMap(priya.viewer(), ({ sites }) =>
          sites.some(({ name }) => name === "Northbank Library Service")
            ? Effect.void
            : Effect.fail("Studio still shows the old name"),
        ),
      );
      expect((yield* served("northbank"))?.manifest?.settings.name).toBe("Northbank Libraries");

      const draft = yield* priya.createDraft({ site: site.site, name: "Opening hours" });
      yield* publish(priya, site.site, draft.id);
      expect((yield* served("northbank"))?.manifest?.settings.name).toBe(
        "Northbank Library Service",
      );
    }).pipe(Effect.scoped),
);

it.live("a save made from settings someone has changed since is refused", () =>
  Effect.gen(function* () {
    const priya = yield* studio(yield* admin);
    const site = yield* newSite(priya, "Library Events", "events");
    const { revision } = yield* priya.siteSettings({ site: site.site });
    yield* priya.saveSiteSettings({
      site: site.site,
      changes: { name: "Library Events and Talks" },
      seen: revision,
    });
    const refused = yield* Effect.flip(
      priya.saveSiteSettings({ site: site.site, changes: { name: "Events" }, seen: revision }),
    );
    expect(refused._tag).toBe("SettingsChanged");
    expect((yield* priya.siteSettings({ site: site.site })).settings.name).toBe(
      "Library Events and Talks",
    );
  }),
);

it.live("an editor sees a site's settings but only a site admin may change them", () =>
  Effect.gen(function* () {
    const priya = yield* studio(yield* admin);
    const site = yield* newSite(priya, "Riverside Parks", "parks");
    const sam = yield* studio(
      yield* join(priya, { name: "Sam Okafor", email: "sam@riverton.test" }, "editor", {
        kind: "site",
        id: site.site,
      }),
    );
    const view = yield* sam.siteSettings({ site: site.site });
    expect(view.can.edit).toBe(false);
    const refused = yield* Effect.flip(
      sam.saveSiteSettings({ site: site.site, changes: { name: "Parks" }, seen: view.revision }),
    );
    expect(refused._tag).toBe("NotPermitted");
  }),
);
