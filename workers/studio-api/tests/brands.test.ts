import { expect, it } from "@effect/vitest";
import { BrandId, MediaId } from "@repo/contracts/ids";
import { defaultTheme, resolveTheme } from "@repo/tokens";
import { Effect } from "effect";

import {
  brandsFor,
  brandView,
  createBrand,
  saveLook,
  saveVoice,
  sitesBehindTheirBrand,
} from "../src/brands.ts";
import { core } from "./support/core.ts";

const person = (id: string) => ({ id, name: id, email: `${id}@pakshi.test` });

const libraries = BrandId.make("brand_a");
const noIdentity = { logo: null, logoOnDark: null, favicon: null };
const plum = { theme: { ...defaultTheme, brandColor: "#7a1f5c" }, identity: noIdentity };

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
    const pale = { ...plum, theme: { ...defaultTheme, brandColor: "#ffe14d" } };
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

it.effect("someone who holds nothing on a brand doesn't see it, or change its look or voice", () =>
  Effect.gen(function* () {
    const voice = { tone: "Plain and warm.", examples: [], wordsToAvoid: ["patrons"] };
    const look = yield* Effect.flip(saveLook(person("user_editor"), libraries, plum, 1));
    const guide = yield* Effect.flip(saveVoice(person("user_editor"), libraries, voice));
    expect([look._tag, guide._tag]).toEqual(["ScopeNotFound", "ScopeNotFound"]);
    expect(yield* brandsFor(person("user_editor"))).toEqual([]);
  }).pipe(Effect.provide(core)),
);

it.effect("the brands list shows each brand's newest look, its tone and its sites", () =>
  Effect.gen(function* () {
    const look = { ...plum, identity: { ...noIdentity, logo: MediaId.make("med_logo") } };
    yield* saveLook(person("user_brand"), libraries, look, 1);
    yield* saveVoice(person("user_brand"), libraries, {
      tone: "Plain and warm.",
      examples: [],
      wordsToAvoid: [],
    });
    const [listed] = yield* brandsFor(person("user_brand"));
    expect(listed).toEqual({
      id: libraries,
      name: "City Libraries",
      theme: resolveTheme(plum.theme).theme,
      identity: look.identity,
      tone: "Plain and warm.",
      sites: [
        { id: "site_a2", name: "Library Events" },
        { id: "site_a1", name: "Northbank Libraries" },
      ],
    });
  }).pipe(Effect.provide(core)),
);

it.effect("a brand's voice guide is what its admin last saved", () =>
  Effect.gen(function* () {
    const voice = { tone: "Plain and warm.", examples: [], wordsToAvoid: ["patrons"] };
    yield* saveVoice(person("user_brand"), libraries, voice);
    expect((yield* brandView(person("user_org"), libraries)).voice).toEqual(voice);
  }).pipe(Effect.provide(core)),
);

it.effect("only org admins make brands, each starting at its first revision", () =>
  Effect.gen(function* () {
    const refused = yield* Effect.flip(
      createBrand(person("user_brand"), "City Museums", "#1f5c44"),
    );
    expect(refused._tag).toBe("NotPermitted");
    const { id } = yield* createBrand(person("user_org"), "City Museums", "#1f5c44");
    const view = yield* brandView(person("user_org"), id);
    expect(view).toMatchObject({ brand: { name: "City Museums" }, revision: { number: 1 } });
    expect(view.look.theme).toEqual({ ...defaultTheme, brandColor: "#1f5c44" });
    expect(yield* brandsFor(person("user_org"))).toContainEqual({
      id,
      name: "City Museums",
      theme: resolveTheme({ ...defaultTheme, brandColor: "#1f5c44" }).theme,
      identity: noIdentity,
      tone: "",
      sites: [],
    });
  }).pipe(Effect.provide(core)),
);
