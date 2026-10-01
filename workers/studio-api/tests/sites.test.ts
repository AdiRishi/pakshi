import { expect, it } from "@effect/vitest";
import { BrandId, MediaId, SiteId } from "@repo/contracts/ids";
import { Effect } from "effect";

import { createSite, findSite, inSiteLibrary, siteFor, siteMedia } from "../src/sites.ts";
import { core } from "./support/core.ts";

const person = (id: string) => ({ id, name: id, email: `${id}@pakshi.test` });

it.effect("an editor reaches the site they edit, with what they may do there", () =>
  Effect.gen(function* () {
    const site = yield* siteFor(person("user_editor"), SiteId.make("site_a2"), "page.edit");
    expect(site).toMatchObject({
      id: "site_a2",
      name: "Library Events",
      brand: "brand_a",
      roles: ["editor"],
    });
    expect(site.permissions).toContain("site.publish");
    expect(site.permissions).not.toContain("site.approve");
  }).pipe(Effect.provide(core)),
);

it.effect("a site someone can't edit fails exactly like one that doesn't exist", () =>
  Effect.gen(function* () {
    const hidden = yield* Effect.flip(
      siteFor(person("user_editor"), SiteId.make("site_a1"), "page.edit"),
    );
    const missing = yield* Effect.flip(
      siteFor(person("user_editor"), SiteId.make("site_zz"), "page.edit"),
    );
    expect(hidden._tag).toBe("SiteNotFound");
    expect(missing._tag).toBe("SiteNotFound");
  }).pipe(Effect.provide(core)),
);

it.effect("a site's images come from its own library and its brand's, newest first", () =>
  Effect.gen(function* () {
    const media = yield* siteMedia({ id: SiteId.make("site_a1"), brand: BrandId.make("brand_a") });
    expect(media.map((image) => image.id)).toEqual(["med_reading", "med_logo"]);
    expect(media[0]).toEqual({
      id: "med_reading",
      contentType: "image/jpeg",
      width: 1600,
      height: 1067,
      alt: "Children reading",
    });
  }).pipe(Effect.provide(core)),
);

it.effect("a site's drafts show only images in its own library or its brand's", () =>
  Effect.gen(function* () {
    const events = { id: SiteId.make("site_a2"), brand: BrandId.make("brand_a") };
    const shows = (media: string) => inSiteLibrary(events, MediaId.make(media));
    expect(yield* shows("med_logo")).toBe(true);
    expect(yield* shows("med_reading")).toBe(false);
    expect(yield* shows("med_trail")).toBe(false);
    expect(yield* shows("med_missing")).toBe(false);
  }).pipe(Effect.provide(core)),
);

it.effect(
  "a site is made by someone who may create sites in its brand, at an address no other site has",
  () =>
    Effect.gen(function* () {
      const libraries = BrandId.make("brand_a");
      const created = yield* createSite(person("user_brand"), libraries, "Archives", "archives");
      expect(yield* findSite(created.id)).toEqual({
        id: created.id,
        name: "Archives",
        brand: "brand_a",
        address: "archives",
      });
      const taken = yield* Effect.flip(
        createSite(person("user_org"), libraries, "Old archives", "archives"),
      );
      expect(taken._tag).toBe("AddressTaken");
      const refused = yield* Effect.flip(
        createSite(person("user_brand"), BrandId.make("brand_b"), "Trail maps", "trail-maps"),
      );
      expect(refused._tag).toBe("ScopeNotFound");
    }).pipe(Effect.provide(core)),
);
