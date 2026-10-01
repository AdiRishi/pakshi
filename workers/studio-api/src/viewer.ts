import { BrandId, SiteId } from "@repo/contracts/ids";
import type { Person, Viewer } from "@repo/contracts/studio";
import { type Access, authorize, mayDefineRole } from "@repo/domain/access";
import { Effect, Option, Schema } from "effect";
import { type SqlError, SqlClient, SqlSchema } from "effect/unstable/sql";

import { loadAccess } from "./access.ts";
import { waitingFor } from "./lists.ts";
import { organizationName } from "./organization.ts";
import { accessPlaces } from "./places.ts";
import { brandsForNewSites } from "./sites.ts";

const SiteRow = Schema.Struct({
  id: SiteId,
  name: Schema.String,
  brand_id: BrandId,
  brand_name: Schema.String,
});

/** The sites a person can reach through any grant or override, before permissions are checked. */
const reachableSites = Effect.fn("StudioApi.reachableSites")(function* (access: Access) {
  const sql = yield* SqlClient.SqlClient;
  const scopes = [...access.grants, ...access.overrides].map((held) => held.scope);
  if (scopes.some((scope) => scope.kind === "organization")) {
    return yield* SqlSchema.findAll({
      Request: Schema.Void,
      Result: SiteRow,
      execute: () => sql`
        select s.id, s.name, s.brand_id, b.name as brand_name
        from sites s join brands b on b.id = s.brand_id
        where s.deleted_at is null
        order by s.name`,
    })(undefined);
  }
  return yield* SqlSchema.findAll({
    Request: Schema.Struct({
      brands: Schema.Array(Schema.String),
      sites: Schema.Array(Schema.String),
    }),
    Result: SiteRow,
    execute: ({ brands, sites }) => sql`
      select s.id, s.name, s.brand_id, b.name as brand_name
      from sites s join brands b on b.id = s.brand_id
      where s.deleted_at is null and (
        s.brand_id in (select value from json_each(${JSON.stringify(brands)}))
        or s.id in (select value from json_each(${JSON.stringify(sites)})))
      order by s.name`,
  })({
    brands: scopes.flatMap((scope) => (scope.kind === "brand" ? [scope.id] : [])),
    sites: scopes.flatMap((scope) => (scope.kind === "site" ? [scope.id] : [])),
  });
});

/** Who is signed in, what they hold, the sites whose pages they can edit, and how many approvals wait for them. */
export const describeViewer = Effect.fn("StudioApi.describeViewer")(function* (
  user: Person,
): Effect.fn.Return<Viewer, Schema.SchemaError | SqlError.SqlError, SqlClient.SqlClient> {
  const { access, grants } = yield* loadAccess(user.id);
  const [sites, organization, newSiteBrands, places] = yield* Effect.all(
    [reachableSites(access), organizationName, brandsForNewSites(user), accessPlaces(access)],
    { concurrency: "unbounded" },
  );
  return {
    user: { id: user.id, name: user.name, email: user.email },
    organization: Option.getOrElse(organization, () => ""),
    roles: grants.map((grant) => ({
      role: grant.role.name,
      scope: grant.scopeName ?? Option.getOrElse(organization, () => "Organization"),
    })),
    sites: sites
      .filter((site) =>
        authorize(access, "page.edit", { kind: "site", id: site.id, brand: site.brand_id }),
      )
      .map((site) => ({ id: site.id, name: site.name, brand: site.brand_name })),
    approvalsWaiting: (yield* waitingFor(user)).length,
    brands: [...access.grants, ...access.overrides].some(
      (held) => held.scope.kind === "organization" || held.scope.kind === "brand",
    ),
    can: {
      createBrand: authorize(access, "brand.create", { kind: "organization" }),
      createSite: newSiteBrands.length > 0,
      invite: places.length > 0,
      manageRoles: mayDefineRole(access, []),
      readAudit: authorize(access, "audit.read", { kind: "organization" }),
    },
  };
});
