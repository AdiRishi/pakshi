import { expect, it } from "@effect/vitest";
import { MediaId, type SiteId } from "@repo/contracts/ids";
import { Cause, Effect } from "effect";
import { SqlClient } from "effect/sql";

import { retainImages } from "../src/media-retention.ts";
import { core } from "./support/core.ts";

const longAgo = "2026-01-01T00:00:00.000Z";

/** Old images in site_a1's library and brand_a's, with the brand's logo named by its revision. */
const oldImages = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`insert into media (id, site_id, brand_id, content_type, width, height, created_at) values
    ('med_old', 'site_a1', null, 'image/jpeg', 800, 600, ${longAgo}),
    ('med_shown', 'site_a1', null, 'image/jpeg', 800, 600, ${longAgo}),
    ('med_brandlogo', null, 'brand_a', 'image/png', 400, 100, ${longAgo})`;
  yield* sql`update brand_revisions
    set identity = '{"logo":"med_brandlogo","logoOnDark":null,"favicon":null}'
    where brand_id = 'brand_a'`;
});

const shows = (images: Readonly<Record<string, ReadonlyArray<string>>>) => (site: SiteId) =>
  Effect.succeed((images[site] ?? []).map((id) => MediaId.make(id)));

const libraryIds = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly id: string }>`select id from media order by id`;
  return rows.map((row) => row.id);
});

it.effect(
  "deletes the files nothing has shown for three months, and keeps shown images, new ones and brand logos",
  () =>
    Effect.gen(function* () {
      yield* oldImages;
      const deleted: Array<MediaId> = [];
      const removed = yield* retainImages(shows({ site_a1: ["med_shown"] }), (media) =>
        Effect.sync(() => void deleted.push(media)),
      );
      expect(removed).toEqual(["med_old"]);
      expect(deleted).toEqual(["med_old"]);
      expect(yield* libraryIds).toEqual([
        "med_brandlogo",
        "med_logo",
        "med_reading",
        "med_shown",
        "med_trail",
      ]);
    }).pipe(Effect.provide(core)),
);

it.effect("deletes nothing while a site can't say which images it shows", () =>
  Effect.gen(function* () {
    yield* oldImages;
    const removed = yield* retainImages(
      (site) =>
        site === "site_b1"
          ? Effect.fail(new Cause.UnknownError("SiteDoc is unavailable"))
          : Effect.succeed([]),
      () => Effect.void,
    );
    expect(removed).toEqual([]);
    expect(yield* libraryIds).toContain("med_old");
  }).pipe(Effect.provide(core)),
);
