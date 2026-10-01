import { BrandId, MediaId, SiteId } from "@repo/contracts/ids";
import { now, Timestamp } from "@repo/contracts/release";
import {
  BrandHasSites,
  type DeletedSite,
  NotPermitted,
  type Person,
  restoreDays,
  ScopeNotFound,
  SiteNotFound,
} from "@repo/contracts/studio";
import { authorize, permissionsOn } from "@repo/domain/access";
import { Effect, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

import { loadAccess } from "./access.ts";
import { audit } from "./audit.ts";
import { siteFor } from "./sites.ts";

/*
 * Deleting sites and brands. A deleted site stops serving at once, its
 * domains are released, and it leaves every list, but its data stays for 30
 * days, while an org admin can restore it. After that a daily job deletes
 * it for good. A brand can only be deleted once it has no sites, deleted
 * ones it can still restore included.
 */

const restoreWindow = restoreDays * 24 * 60 * 60 * 1000;

/** The hosts KV sends to a site: its platform subdomain's and its domains'. */
export interface SiteHosts {
  readonly address: string | null;
  readonly domains: ReadonlyArray<string>;
}

/**
 * Deletes a site for someone who may. `unroute` takes the hosts it answered
 * at out of KV, and its domains are released at once.
 */
export const deleteSite = Effect.fn("StudioApi.deleteSite")(function* (
  person: Person,
  site: SiteId,
  unroute: (hosts: SiteHosts) => Effect.Effect<void>,
) {
  const sql = yield* SqlClient.SqlClient;
  const found = yield* siteFor(person, site, "site.delete").pipe(
    Effect.catchTag("SiteNotFound", () =>
      Effect.fail(new NotPermitted({ action: "delete this site" })),
    ),
  );
  const domains = yield* sql<{ readonly hostname: string }>`select hostname from domains
    where site_id = ${site}`;
  // KV first, so a deletion that stops partway leaves a site that can be deleted again.
  yield* unroute({ address: found.address, domains: domains.map((domain) => domain.hostname) });
  yield* sql`delete from domains where site_id = ${site}`;
  yield* sql`update sites set deleted_at = ${now()}, deleted_by = ${person.id} where id = ${site}`;
  yield* audit(person, { site }, { _tag: "SiteDeleted", name: found.name });
});

const DeletedRow = Schema.Struct({
  id: SiteId,
  name: Schema.String,
  brand: Schema.String,
  address: Schema.NullOr(Schema.String),
  deleted_at: Timestamp,
  deleted_by: Schema.NullOr(Schema.String),
});

const deletedSince = Effect.fn("StudioApi.deletedSince")(function* (since: string) {
  const sql = yield* SqlClient.SqlClient;
  return yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: DeletedRow,
    execute: () => sql`select s.id, s.name, b.name as brand, s.address, s.deleted_at,
        u.name as deleted_by
      from sites s join brands b on b.id = s.brand_id left join "user" u on u.id = s.deleted_by
      where s.deleted_at is not null and s.deleted_at >= ${since}
      order by s.deleted_at desc`,
  })(undefined);
});

/** Whether a person may restore deleted sites: org admins, who may delete any site. */
const restores = Effect.fn("StudioApi.restores")(function* (person: Person) {
  const { access } = yield* loadAccess(person.id);
  return authorize(access, "site.delete", { kind: "organization" });
});

/** The sites deleted in the last 30 days, for someone who may restore them. */
export const deletedSites = Effect.fn("StudioApi.deletedSites")(function* (person: Person) {
  if (!(yield* restores(person))) return [];
  const rows = yield* deletedSince(new Date(Date.now() - restoreWindow).toISOString());
  return rows.map((row): DeletedSite => ({
    id: row.id,
    name: row.name,
    brand: row.brand,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
  }));
});

/**
 * Brings back a site deleted in the last 30 days. `route` puts its platform
 * subdomain back in KV. Its domains were released, so they have to be added
 * again.
 */
export const restoreSite = Effect.fn("StudioApi.restoreSite")(function* (
  person: Person,
  site: SiteId,
  route: (address: string) => Effect.Effect<void>,
) {
  const sql = yield* SqlClient.SqlClient;
  if (!(yield* restores(person))) return yield* new NotPermitted({ action: "restore sites" });
  const found = (yield* deletedSince(new Date(Date.now() - restoreWindow).toISOString())).find(
    (row) => row.id === site,
  );
  if (found === undefined) return yield* new SiteNotFound({ site });
  // KV first, so a restore that stops partway leaves a site that can be restored again.
  if (found.address !== null) yield* route(found.address);
  yield* sql`update sites set deleted_at = null, deleted_by = null where id = ${site}`;
  yield* audit(person, { site }, { _tag: "SiteRestored", name: found.name });
});

/** Tables whose rows belong to a site by their `site_id`. */
const siteTables = [
  "releases",
  "submissions",
  "draft_shares",
  "block_usage",
  "block_requests",
  "domains",
  "conversations",
] as const;

/** Tables of grants and settings that apply to a scope. */
const scopedTables = ["grants", "permission_overrides", "workflows", "invitations"] as const;

/**
 * Deletes for good every site deleted more than 30 days ago, and returns
 * their IDs. `erase` deletes what the site keeps outside D1: its Durable
 * Objects and its objects in R2; `deleteFile` deletes a library file.
 */
export const purgeDeletedSites = Effect.fn("StudioApi.purgeDeletedSites")(function* (
  erase: (site: SiteId) => Effect.Effect<void>,
  deleteFile: (media: MediaId) => Effect.Effect<void>,
) {
  const sql = yield* SqlClient.SqlClient;
  const cutoff = new Date(Date.now() - restoreWindow).toISOString();
  const expired = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: Schema.Struct({ id: SiteId, name: Schema.String }),
    execute: () =>
      sql`select id, name from sites where deleted_at is not null and deleted_at < ${cutoff}`,
  })(undefined);
  for (const { id, name } of expired) {
    yield* erase(id);
    const media = yield* sql<{ readonly id: MediaId }>`delete from media
      where site_id = ${id} returning id`;
    for (const file of media) yield* deleteFile(file.id);
    for (const table of siteTables) yield* sql`delete from ${sql(table)} where site_id = ${id}`;
    for (const table of scopedTables)
      yield* sql`delete from ${sql(table)} where scope_kind = 'site' and scope_id = ${id}`;
    // Filed before the site's row goes, so the entry keeps the site's brand.
    yield* audit(null, { site: id }, { _tag: "SitePurged", name });
    yield* sql`delete from sites where id = ${id}`;
  }
  return expired.map(({ id }) => id);
});

/** Deletes a brand that has no sites, with its revisions, library and grants. */
export const deleteBrand = Effect.fn("StudioApi.deleteBrand")(function* (
  person: Person,
  brand: BrandId,
  deleteFile: (media: MediaId) => Effect.Effect<void>,
) {
  const sql = yield* SqlClient.SqlClient;
  const { access } = yield* loadAccess(person.id);
  const resource = { kind: "brand", id: brand } as const;
  const [exists] = yield* sql`select 1 from brands where id = ${brand}`;
  if (exists === undefined || permissionsOn(access, resource).length === 0)
    return yield* new ScopeNotFound({});
  if (!authorize(access, "brand.delete", resource))
    return yield* new NotPermitted({ action: "delete this brand" });
  const [count] = yield* sql<{ readonly sites: number }>`select count(*) as sites
    from sites where brand_id = ${brand}`;
  if ((count?.sites ?? 0) > 0) return yield* new BrandHasSites({ sites: count?.sites ?? 0 });
  const media = yield* sql<{ readonly id: MediaId }>`delete from media
    where brand_id = ${brand} returning id`;
  for (const file of media) yield* deleteFile(file.id);
  yield* sql`delete from brand_revisions where brand_id = ${brand}`;
  for (const table of scopedTables)
    yield* sql`delete from ${sql(table)} where scope_kind = 'brand' and scope_id = ${brand}`;
  const [named] = yield* sql<{
    readonly name: string;
  }>`select name from brands where id = ${brand}`;
  yield* sql`delete from brands where id = ${brand}`;
  yield* audit(person, { brand }, { _tag: "BrandDeleted", name: named?.name ?? "" });
});
