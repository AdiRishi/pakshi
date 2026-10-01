import { MediaId, SiteId } from "@repo/contracts/ids";
import { now } from "@repo/contracts/release";
import { type Cause, Effect, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

/*
 * Library files are kept while any site's live release or open draft shows
 * them, and for three months after the last one stops, so a rollback or a
 * restored release soon after still has its images. A brand's logos and
 * icon are kept while any of its revisions names them.
 */

/** How long an image nothing shows is kept. */
export const keptUnused = 90 * 24 * 60 * 60 * 1000;

/**
 * Records that the images each site shows are in use, then deletes the files
 * nothing has shown for longer than `keptUnused`, and returns their IDs.
 * `inUse` asks a site's SiteDoc for the images it shows; a site that can't
 * answer keeps every image until it next can.
 */
export const retainImages = Effect.fn("StudioApi.retainImages")(function* (
  inUse: (site: SiteId) => Effect.Effect<ReadonlyArray<MediaId>, Cause.UnknownError>,
  deleteFile: (media: MediaId) => Effect.Effect<void>,
) {
  const sql = yield* SqlClient.SqlClient;
  const sites = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: Schema.Struct({ id: SiteId }),
    execute: () => sql`select id from sites`,
  })(undefined);
  const checkedAt = now();
  const answered = yield* Effect.forEach(
    sites,
    ({ id }) =>
      inUse(id).pipe(
        Effect.flatMap((media) =>
          sql`update media set last_used_at = ${checkedAt}
            where id in (select value from json_each(${JSON.stringify(media)}))`.pipe(
            Effect.as(true),
          ),
        ),
        Effect.catchTag("UnknownError", (cause) =>
          Effect.as(Effect.logError(`Asking ${id} for the images it shows failed`, cause), false),
        ),
      ),
    { concurrency: 10 },
  );
  if (answered.includes(false)) return [];
  const cutoff = new Date(Date.now() - keptUnused).toISOString();
  const stale = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: Schema.Struct({ id: MediaId }),
    execute: () => sql`select id from media
      where coalesce(last_used_at, created_at) < ${cutoff}
        and id not in (
          select value from brand_revisions, json_each(brand_revisions.identity)
          where value is not null
        )`,
  })(undefined);
  for (const { id } of stale) {
    yield* deleteFile(id);
    yield* sql`delete from media where id = ${id}`;
  }
  return stale.map(({ id }) => id);
});
