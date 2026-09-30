import { ReleaseId, SiteId, SnapshotId } from "@repo/contracts/ids";
import { LiveRelease } from "@repo/contracts/snapshot";
import { Effect, Equal, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

const LatestRow = Schema.Struct({ site_id: SiteId, id: ReleaseId, snapshot: SnapshotId });

const decodeLive = Schema.decodeUnknownOption(Schema.fromJsonString(LiveRelease));

/**
 * The scheduled check that KV serves each site's live release. It compares
 * KV with D1's copy of each site's releases, and where they differ it asks
 * that site's SiteDoc, the source of truth, to write both again. It never
 * writes KV itself, so it can't put back a stale release. Returns the sites
 * it asked.
 */
export const reconcileSites = Effect.fn("StudioApi.reconcileSites")(function* (
  /** The `site → release` value KV holds for a site, or null when it holds none. */
  served: (site: SiteId) => Promise<string | null>,
  reconcile: (site: SiteId) => Effect.Effect<void>,
) {
  const sql = yield* SqlClient.SqlClient;
  const latest = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: LatestRow,
    execute: () => sql`
      select r.site_id, r.id, r.snapshot from releases r
      where r.seq = (select max(seq) from releases where site_id = r.site_id)`,
  })(undefined);
  const stale = yield* Effect.filter(
    latest,
    (row) =>
      Effect.map(
        Effect.promise(() => served(row.site_id)),
        (value) =>
          !Option.exists(decodeLive(value), (live) =>
            Equal.equals(live, { release: row.id, snapshot: row.snapshot }),
          ),
      ),
    { concurrency: 10 },
  );
  yield* Effect.forEach(stale, (row) => reconcile(row.site_id), { concurrency: 10 });
  return stale.map((row) => row.site_id);
});
