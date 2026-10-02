import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { edit, newSite, publish, readyPage } from "./support/sites.ts";
import { join, setUp, studio } from "./support/studio.ts";

const admin = Effect.cached(
  setUp({
    organization: "Harbour Schools",
    name: "Meera Kapoor",
    email: "meera@harbour.test",
    password: "meera-password",
  }),
).pipe(Effect.runSync);

it.live("a block's usage names the person's sites whose live release shows it", () =>
  Effect.gen(function* () {
    const meera = yield* studio(yield* admin);
    const school = yield* newSite(meera, "Summer School", "summer");
    const trust = yield* newSite(meera, "Sailing Trust", "trust");
    yield* edit(meera, school.site, school.draft, readyPage(school.home, "Workshops"));
    yield* publish(meera, school.site, school.draft);

    expect(yield* meera.blockUsage({ type: "rich-text" })).toEqual([
      { site: { id: school.site, name: "Summer School" }, version: 1, pages: 1, sitewide: false },
    ]);
    // Every site pins every block, but only the ones it shows count.
    expect(yield* meera.blockUsage({ type: "faq" })).toEqual([]);
    expect((yield* meera.blockUsage({ type: "header" })).map((use) => use.site.name)).toEqual([
      "Sailing Trust",
      "Summer School",
    ]);

    const sam = yield* studio(
      yield* join(meera, { name: "Sam Okafor", email: "sam@harbour.test" }, "editor", {
        kind: "site",
        id: trust.site,
      }),
    );
    expect((yield* sam.blockUsage({ type: "header" })).map((use) => use.site.name)).toEqual([
      "Sailing Trust",
    ]);
  }),
);

it.live("only the platform team sees which blocks sites can update", () =>
  Effect.gen(function* () {
    const meera = yield* studio(yield* admin);
    const library = yield* newSite(meera, "Library", "library");
    const priya = yield* studio(
      yield* join(meera, { name: "Priya Shah", email: "priya@harbour.test" }, "editor", {
        kind: "site",
        id: library.site,
      }),
    );

    // Every new site shows each block's newest version.
    expect((yield* meera.blockUpdates()).behind).toEqual([]);
    expect((yield* Effect.flip(priya.blockUpdates()))._tag).toBe("NotPermitted");
    expect((yield* Effect.flip(priya.upgradeEverywhere({ type: "hero" })))._tag).toBe(
      "NotPermitted",
    );
  }),
);
