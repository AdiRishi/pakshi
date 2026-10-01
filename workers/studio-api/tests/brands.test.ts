import { expect, it } from "@effect/vitest";
import { BrandId, MediaId } from "@repo/contracts/ids";
import { Effect } from "effect";

import { brandsFor, brandView, saveLook, saveVoice, sitesBehindTheirBrand } from "../src/brands.ts";
import { core } from "./support/core.ts";

const person = (id: string) => ({ id, name: id, email: `${id}@pakshi.test` });

const libraries = BrandId.make("brand_a");
const noIdentity = { logo: null, logoOnDark: null, favicon: null };
const plum = {
  theme: { preset: "editorial", changes: { brandColor: "#7a1f5c" } },
  identity: noIdentity,
} as const;

it.effect("saving a brand's look makes its next revision, which the brand's sites are behind", () =>
  Effect.gen(function* () {
    const saved = yield* saveLook(person("user_brand"), libraries, plum, 1);
    expect(saved.number).toBe(2);
    const view = yield* brandView(person("user_brand"), libraries);
    expect(view.revision.number).toBe(2);
    expect(view.look.theme).toEqual(plum.theme);
    expect(
      (yield* sitesBehindTheirBrand()).map((behind) => [behind.site, behind.revision.number]),
    ).toEqual([
      ["site_a1", 2],
      ["site_a2", 2],
      ["site_b1", 1],
    ]);
  }).pipe(Effect.provide(core)),
);

it.effect("a theme with a pair of colors too hard to read can't be saved", () =>
  Effect.gen(function* () {
    const pale = {
      ...plum,
      theme: { preset: "editorial", changes: { brandColor: "#ffe14d" } },
    } as const;
    const error = yield* Effect.flip(saveLook(person("user_brand"), libraries, pale, 1));
    expect(error._tag).toBe("ThemeUnreadable");
    expect((yield* brandView(person("user_brand"), libraries)).revision.number).toBe(1);
  }).pipe(Effect.provide(core)),
);

it.effect("a save from a revision someone has since moved on from is refused", () =>
  Effect.gen(function* () {
    yield* saveLook(person("user_brand"), libraries, plum, 1);
    const error = yield* Effect.flip(saveLook(person("user_org"), libraries, plum, 1));
    expect(error).toMatchObject({ _tag: "BrandChanged", revision: 2 });
  }).pipe(Effect.provide(core)),
);

it.effect("a logo must come from the brand's own library", () =>
  Effect.gen(function* () {
    const withLogo = (logo: string) => ({
      ...plum,
      identity: { ...noIdentity, logo: MediaId.make(logo) },
    });
    const error = yield* Effect.flip(
      saveLook(person("user_brand"), libraries, withLogo("med_reading"), 1),
    );
    expect(error._tag).toBe("NotInBrandLibrary");
    expect(
      (yield* saveLook(person("user_brand"), libraries, withLogo("med_logo"), 1)).identity.logo,
    ).toBe("med_logo");
  }).pipe(Effect.provide(core)),
);

it.effect("only people who may edit the brand's theme change its look or voice", () =>
  Effect.gen(function* () {
    expect((yield* Effect.flip(saveLook(person("user_editor"), libraries, plum, 1)))._tag).toBe(
      "ScopeNotFound",
    );
    const voice = { tone: "Plain and warm.", examples: [], wordsToAvoid: ["patrons"] };
    expect(yield* saveVoice(person("user_brand"), libraries, voice)).toEqual(voice);
    expect((yield* brandView(person("user_org"), libraries)).voice).toEqual(voice);
    expect((yield* brandsFor(person("user_brand"))).map((brand) => brand.id)).toEqual(["brand_a"]);
  }).pipe(Effect.provide(core)),
);
