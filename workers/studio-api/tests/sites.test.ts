import { expect, it } from "@effect/vitest";
import { BrandId, MediaId, SiteId } from "@repo/contracts/ids";
import { Effect } from "effect";

import { canSeeMedia, siteFor, siteMedia } from "../src/sites.ts";
import { core } from "./support/core.ts";

const person = (id: string) => ({ id, name: id, email: `${id}@pakshi.test` });

it.effect("an editor reaches the site they edit", () =>
  Effect.gen(function* () {
    const site = yield* siteFor(person("user_editor"), SiteId.make("site_a2"), "page.edit");
    expect(site).toEqual({ id: "site_a2", name: "Library Events", brand: "brand_a" });
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

it.effect("a library image is visible only to people who can edit a site it belongs to", () =>
  Effect.gen(function* () {
    const sees = (user: string, media: string) => canSeeMedia(person(user), MediaId.make(media));
    // The editor edits Library Events, in the City Libraries brand.
    expect(yield* sees("user_editor", "med_logo")).toBe(true);
    expect(yield* sees("user_editor", "med_reading")).toBe(false);
    expect(yield* sees("user_editor", "med_trail")).toBe(false);
    expect(yield* sees("user_org", "med_trail")).toBe(true);
    expect(yield* sees("user_org", "med_missing")).toBe(false);
  }).pipe(Effect.provide(core)),
);
