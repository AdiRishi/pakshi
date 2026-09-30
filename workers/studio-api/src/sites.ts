import type { Permission } from "@repo/contracts/access";
import { BrandId, MediaId, SiteId } from "@repo/contracts/ids";
import { MediaFile } from "@repo/contracts/snapshot";
import { type Person, SiteNotFound } from "@repo/contracts/studio";
import { authorize, permissionsOn, rolesOn } from "@repo/domain/access";
import type { Approver } from "@repo/domain/approvals";
import { Effect, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

import { loadAccess } from "./access.ts";

const SiteRow = Schema.Struct({ id: SiteId, name: Schema.String, brand_id: BrandId });

/** A site, whoever is asking. Callers decide what the person may see of it. */
export const findSite = Effect.fn("StudioApi.findSite")(function* (site: SiteId) {
  const sql = yield* SqlClient.SqlClient;
  const found = yield* SqlSchema.findOneOption({
    Request: SiteId,
    Result: SiteRow,
    execute: (id) => sql`select id, name, brand_id from sites where id = ${id}`,
  })(site);
  if (Option.isNone(found)) return yield* new SiteNotFound({ site });
  return { id: found.value.id, name: found.value.name, brand: found.value.brand_id };
});

/** What a person holds on a site: their permissions, and the roles their grants give them there. */
export const standingOn = Effect.fn("StudioApi.standingOn")(function* (
  person: Person,
  site: { readonly id: SiteId; readonly brand: BrandId },
) {
  const { access } = yield* loadAccess(person.id);
  const resource = { kind: "site", id: site.id, brand: site.brand } as const;
  return { permissions: permissionsOn(access, resource), roles: rolesOn(access, resource) };
});

/**
 * A site the person holds any permission on, with the permissions they hold
 * there. A site they hold none on fails the same way as one that doesn't
 * exist, so IDs reveal nothing.
 */
export const siteOf = Effect.fn("StudioApi.siteOf")(function* (person: Person, site: SiteId) {
  const found = yield* findSite(site);
  const { permissions, roles } = yield* standingOn(person, found);
  if (permissions.length === 0) return yield* new SiteNotFound({ site });
  return { ...found, permissions, roles };
});

/**
 * A site the person may act on with this permission. A site they can't reach
 * that way fails the same way as one that doesn't exist.
 */
export const siteFor = Effect.fn("StudioApi.siteFor")(function* (
  person: Person,
  site: SiteId,
  permission: Permission,
) {
  const found = yield* siteOf(person, site);
  if (!found.permissions.includes(permission)) return yield* new SiteNotFound({ site });
  return found;
});

/** The person as someone who may decide on the site's submissions. */
export const approverOn = (
  person: Person,
  standing: { readonly permissions: ReadonlyArray<Permission>; readonly roles: Approver["roles"] },
): Approver => ({
  person: { id: person.id, name: person.name },
  roles: standing.roles,
  permissions: standing.permissions,
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

/** Whether an image is in a site's library or its brand's. */
export const inSiteLibrary = Effect.fn("StudioApi.inSiteLibrary")(function* (
  site: { readonly id: SiteId; readonly brand: BrandId },
  media: MediaId,
) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql`select 1 from media
    where id = ${media} and (site_id = ${site.id} or brand_id = ${site.brand})`;
  return rows.length > 0;
});

/**
 * Whether a person may see a library image: one in a site's library to
 * people who can edit that site, one in a brand's library to people who can
 * edit any site in the brand. An image in no library is seen by no one.
 */
export const canSeeMedia = Effect.fn("StudioApi.canSeeMedia")(function* (
  person: Person,
  media: MediaId,
) {
  const sql = yield* SqlClient.SqlClient;
  const sites = yield* SqlSchema.findAll({
    Request: MediaId,
    Result: Schema.Struct({ id: SiteId, brand_id: BrandId }),
    execute: (id) => sql`
      select s.id, s.brand_id from media m
      join sites s on s.id = m.site_id or s.brand_id = m.brand_id
      where m.id = ${id}`,
  })(media);
  if (sites.length === 0) return false;
  const { access } = yield* loadAccess(person.id);
  return sites.some((site) =>
    authorize(access, "page.edit", { kind: "site", id: site.id, brand: site.brand_id }),
  );
});
