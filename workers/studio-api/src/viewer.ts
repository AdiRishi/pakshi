import { BrandId, SiteId } from "@repo/contracts/ids";
import type { Person, Viewer } from "@repo/contracts/studio";
import { type Access, authorize, defaultRoles, Grant, Override, Scope } from "@repo/domain/access";
import { Effect, Schema } from "effect";
import { type SqlError, SqlClient, SqlSchema } from "effect/unstable/sql";

const ScopeRow = Schema.Struct({
  scope_kind: Schema.Literals(["organization", "brand", "site"]),
  scope_id: Schema.NullOr(Schema.String),
});

const scopeOf = (row: typeof ScopeRow.Type) =>
  Schema.decodeUnknownEffect(Scope)(
    row.scope_kind === "organization"
      ? { kind: "organization" }
      : { kind: row.scope_kind, id: row.scope_id },
  );

const GrantRow = Schema.Struct({
  ...ScopeRow.fields,
  role: Grant.fields.role,
  scope_name: Schema.NullOr(Schema.String),
});

const OverrideRow = Schema.Struct({
  ...ScopeRow.fields,
  permission: Override.fields.permission,
  allowed: Schema.Literals([0, 1]),
});

const SiteRow = Schema.Struct({
  id: SiteId,
  name: Schema.String,
  brand_id: BrandId,
  brand_name: Schema.String,
});

/** A person's grants and overrides, as `authorize` reads them. */
export const loadAccess = Effect.fn("StudioApi.loadAccess")(function* (userId: string) {
  const sql = yield* SqlClient.SqlClient;
  const findGrants = SqlSchema.findAll({
    Request: Schema.String,
    Result: GrantRow,
    execute: (user) => sql`
      select g.role, g.scope_kind, g.scope_id, coalesce(b.name, s.name) as scope_name
      from grants g
      left join brands b on g.scope_kind = 'brand' and b.id = g.scope_id
      left join sites s on g.scope_kind = 'site' and s.id = g.scope_id
      where g.user_id = ${user}`,
  });
  const findOverrides = SqlSchema.findAll({
    Request: Schema.String,
    Result: OverrideRow,
    execute: (user) => sql`
      select permission, scope_kind, scope_id, allowed
      from permission_overrides
      where user_id = ${user}`,
  });
  const [grants, overrides] = yield* Effect.all([findGrants(userId), findOverrides(userId)], {
    concurrency: "unbounded",
  });
  const access: Access = {
    grants: yield* Effect.forEach(grants, (grant) =>
      Effect.map(scopeOf(grant), (scope) => ({ role: grant.role, scope })),
    ),
    overrides: yield* Effect.forEach(overrides, (override) =>
      Effect.map(scopeOf(override), (scope) => ({
        permission: override.permission,
        scope,
        allowed: override.allowed === 1,
      })),
    ),
  };
  return { access, grants };
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
      where s.brand_id in (select value from json_each(${JSON.stringify(brands)}))
        or s.id in (select value from json_each(${JSON.stringify(sites)}))
      order by s.name`,
  })({
    brands: scopes.flatMap((scope) => (scope.kind === "brand" ? [scope.id] : [])),
    sites: scopes.flatMap((scope) => (scope.kind === "site" ? [scope.id] : [])),
  });
});

/** Who is signed in, what they hold, and the sites whose pages they can edit. */
export const describeViewer = Effect.fn("StudioApi.describeViewer")(function* (
  user: Person,
): Effect.fn.Return<Viewer, Schema.SchemaError | SqlError.SqlError, SqlClient.SqlClient> {
  const { access, grants } = yield* loadAccess(user.id);
  const sites = yield* reachableSites(access);
  return {
    user: { id: user.id, name: user.name, email: user.email },
    roles: grants.map((grant) => ({
      role: defaultRoles[grant.role].title,
      scope: grant.scope_name ?? "Organization",
    })),
    sites: sites
      .filter((site) =>
        authorize(access, "page.edit", { kind: "site", id: site.id, brand: site.brand_id }),
      )
      .map((site) => ({ id: site.id, name: site.name, brand: site.brand_name })),
  };
});
