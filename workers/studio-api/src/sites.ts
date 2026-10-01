import type { Permission } from "@repo/contracts/access";
import { BrandId, MediaId, randomId, SiteId } from "@repo/contracts/ids";
import { Timestamp } from "@repo/contracts/release";
import { MediaFile } from "@repo/contracts/snapshot";
import {
  AddressTaken,
  NotPermitted,
  type Person,
  ScopeNotFound,
  type SiteAddress,
  SiteNotFound,
} from "@repo/contracts/studio";
import { authorize, permissionsOn, rolesOn } from "@repo/domain/access";
import type { Approver } from "@repo/domain/approvals";
import { Effect, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

import { describeScope, loadAccess } from "./access.ts";

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

const summaryOf = (row: typeof MediaRow.Type) => ({
  id: row.id,
  contentType: row.content_type,
  width: row.width,
  height: row.height,
  alt: row.alt,
});

const LibraryRow = Schema.Struct({
  ...MediaRow.fields,
  name: Schema.String,
  size: Schema.Int,
  uploaded_by: Schema.NullOr(Schema.String),
  created_at: Timestamp,
});

/**
 * The images in a site's own library or a brand's, newest first, with who
 * uploaded each. `usedOn` gives the pages that show an image.
 */
export const libraryImages = Effect.fn("StudioApi.libraryImages")(function* (
  owner:
    | { readonly kind: "site"; readonly id: SiteId }
    | { readonly kind: "brand"; readonly id: BrandId },
  usedOn: (media: MediaId) => ReadonlyArray<string>,
) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: LibraryRow,
    execute: () => sql`
      select media.id, content_type, width, height, alt, media.name, size,
        "user".name as uploaded_by, media.created_at
      from media left join "user" on "user".id = media.uploaded_by
      where ${owner.kind === "site" ? sql`site_id = ${owner.id}` : sql`brand_id = ${owner.id}`}
      order by media.created_at desc, media.id`,
  })(undefined);
  return rows.map((row) => ({
    ...summaryOf(row),
    name: row.name,
    size: row.size,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.created_at,
    usedOn: usedOn(row.id),
  }));
});

/** Which library an image is in, of a site's and its brand's. */
export const libraryOf = Effect.fn("StudioApi.libraryOf")(function* (
  site: { readonly id: SiteId; readonly brand: BrandId },
  media: MediaId,
) {
  const sql = yield* SqlClient.SqlClient;
  const [row] = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: Schema.Struct({ site_id: Schema.NullOr(SiteId) }),
    execute: () => sql`select site_id from media
      where id = ${media} and (site_id = ${site.id} or brand_id = ${site.brand})`,
  })(undefined);
  if (row === undefined) return null;
  return row.site_id === null ? ("brand" as const) : ("site" as const);
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
  return rows.map(summaryOf);
});

/** The images in a brand's own library, newest first. */
export const brandMedia = Effect.fn("StudioApi.brandMedia")(function* (brand: BrandId) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: MediaRow,
    execute: () => sql`
      select id, content_type, width, height, alt from media
      where brand_id = ${brand} order by created_at desc, id`,
  })(undefined);
  return rows.map(summaryOf);
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

/** The brands a person may make sites in. */
export const brandsForNewSites = Effect.fn("StudioApi.brandsForNewSites")(function* (
  person: Person,
) {
  const sql = yield* SqlClient.SqlClient;
  const { access } = yield* loadAccess(person.id);
  const brands = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: Schema.Struct({ id: BrandId, name: Schema.String }),
    execute: () => sql`select id, name from brands order by name`,
  })(undefined);
  return brands.filter((brand) =>
    authorize(access, "site.create", { kind: "brand", id: brand.id }),
  );
});

/**
 * Records a new site in a brand, for someone who may create sites there,
 * with the platform subdomain it takes. Its SiteDoc starts it next.
 */
export const createSite = Effect.fn("StudioApi.createSite")(function* (
  person: Person,
  brand: BrandId,
  name: string,
  address: SiteAddress,
) {
  const sql = yield* SqlClient.SqlClient;
  const { resource } = yield* describeScope({ kind: "brand", id: brand });
  const { access } = yield* loadAccess(person.id);
  if (permissionsOn(access, resource).length === 0) return yield* new ScopeNotFound({});
  if (!authorize(access, "site.create", resource))
    return yield* new NotPermitted({ action: "create sites in this brand" });
  const id = SiteId.make(randomId("site"));
  const inserted = yield* sql`insert into sites (id, brand_id, name, address)
    values (${id}, ${brand}, ${name}, ${address})
    on conflict (address) do nothing returning id`;
  if (inserted.length === 0) return yield* new AddressTaken({ address });
  return { id, name, brand };
});
