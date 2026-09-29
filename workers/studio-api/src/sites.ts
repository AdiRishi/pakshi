import { BrandId, MediaId, SiteId } from "@repo/contracts/ids";
import { MediaFile } from "@repo/contracts/snapshot";
import { type Person, SiteNotFound } from "@repo/contracts/studio";
import { authorize, type Permission } from "@repo/domain/access";
import { Effect, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

import { loadAccess } from "./viewer.ts";

const SiteRow = Schema.Struct({ id: SiteId, name: Schema.String, brand_id: BrandId });

/**
 * A site the person may act on with this permission. A site they can't reach
 * fails the same way as one that doesn't exist.
 */
export const siteFor = Effect.fn("StudioApi.siteFor")(function* (
  person: Person,
  site: SiteId,
  permission: Permission,
) {
  const sql = yield* SqlClient.SqlClient;
  const found = yield* SqlSchema.findOneOption({
    Request: SiteId,
    Result: SiteRow,
    execute: (id) => sql`select id, name, brand_id from sites where id = ${id}`,
  })(site);
  if (Option.isNone(found)) return yield* new SiteNotFound({ site });
  const { access } = yield* loadAccess(person.id);
  const resource = { kind: "site", id: found.value.id, brand: found.value.brand_id } as const;
  if (!authorize(access, permission, resource)) return yield* new SiteNotFound({ site });
  return { id: found.value.id, name: found.value.name, brand: found.value.brand_id };
});

const MediaRow = Schema.Struct({
  id: MediaId,
  content_type: MediaFile.fields.contentType,
  width: MediaFile.fields.width,
  height: MediaFile.fields.height,
  alt: Schema.String,
});

/** The images a site can place: its own library and its brand's, newest first. */
export const siteMedia = Effect.fn("StudioApi.siteMedia")(function* (site: {
  readonly id: SiteId;
  readonly brand: BrandId;
}) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: MediaRow,
    execute: () => sql`
      select id, content_type, width, height, alt from media
      where site_id = ${site.id} or brand_id = ${site.brand}
      order by created_at desc, id`,
  })(undefined);
  return rows.map((row) => ({
    id: row.id,
    contentType: row.content_type,
    width: row.width,
    height: row.height,
    alt: row.alt,
  }));
});
