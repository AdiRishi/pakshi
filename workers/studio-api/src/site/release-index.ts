import type { SiteId } from "@repo/contracts/ids";
import { Release } from "@repo/contracts/release";
import { Effect, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

import type { IndexedRelease } from "./releases.ts";

const encodeRelease = Schema.encodeSync(Schema.fromJsonString(Release));

/**
 * Writes a site's release into D1's copy. Recording it again rewrites every
 * column, so a copy that drifted from SiteDoc's is put right.
 */
export const recordRelease = Effect.fn("StudioApi.recordRelease")(function* (
  site: SiteId,
  { seq, release }: IndexedRelease,
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`insert into releases (id, site_id, seq, snapshot, release, published_at)
    values (${release.id}, ${site}, ${seq}, ${release.snapshot}, ${encodeRelease(release)}, ${release.at})
    on conflict (id) do update set site_id = excluded.site_id, seq = excluded.seq,
      snapshot = excluded.snapshot, release = excluded.release,
      published_at = excluded.published_at`;
});
