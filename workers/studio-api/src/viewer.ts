import { BrandId, SiteId } from "@repo/contracts/ids";
import type { Person, Viewer } from "@repo/contracts/studio";
import { type Access, authorize, defaultRoles, Grant, Override, Scope } from "@repo/domain/access";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Schema } from "effect";

const ScopeRow = Schema.Struct({
  scope_kind: Schema.Literals(["organization", "brand", "site"]),
  scope_id: Schema.NullOr(Schema.String),
});

const scopeOf = (row: typeof ScopeRow.Type) =>
  Schema.decodeUnknownSync(Scope)(
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

// D1 returns untyped rows, so each query's rows are decoded against their own schema.
const decodeGrants = Schema.decodeUnknownSync(Schema.Array(GrantRow));
const decodeOverrides = Schema.decodeUnknownSync(Schema.Array(OverrideRow));
const decodeSites = Schema.decodeUnknownSync(Schema.Array(SiteRow));

const results = async (statement: D1PreparedStatement) => (await statement.all()).results;

/** A person's grants and overrides, as `authorize` reads them. */
export const loadAccess = async (env: StudioApiEnv, userId: string) => {
  const [grantRows, overrideRows] = await Promise.all([
    results(
      env.CORE.prepare(
        `select g.role, g.scope_kind, g.scope_id, coalesce(b.name, s.name) as scope_name
         from grants g
         left join brands b on g.scope_kind = 'brand' and b.id = g.scope_id
         left join sites s on g.scope_kind = 'site' and s.id = g.scope_id
         where g.user_id = ?`,
      ).bind(userId),
    ),
    results(
      env.CORE.prepare(
        "select permission, scope_kind, scope_id, allowed from permission_overrides where user_id = ?",
      ).bind(userId),
    ),
  ]);
  const grants = decodeGrants(grantRows);
  const overrides = decodeOverrides(overrideRows);
  const access: Access = {
    grants: grants.map((grant) => ({ role: grant.role, scope: scopeOf(grant) })),
    overrides: overrides.map((override) => ({
      permission: override.permission,
      scope: scopeOf(override),
      allowed: override.allowed === 1,
    })),
  };
  return { access, grants };
};

/** The sites a person can reach through any grant or override, before permissions are checked. */
const reachableSites = (env: StudioApiEnv, access: Access) => {
  const scopes = [
    ...access.grants.map((grant) => grant.scope),
    ...access.overrides.map((o) => o.scope),
  ];
  const select = `select s.id, s.name, s.brand_id, b.name as brand_name
    from sites s join brands b on b.id = s.brand_id`;
  if (scopes.some((scope) => scope.kind === "organization"))
    return env.CORE.prepare(`${select} order by s.name`);
  const brands = scopes.flatMap((scope) => (scope.kind === "brand" ? [scope.id] : []));
  const sites = scopes.flatMap((scope) => (scope.kind === "site" ? [scope.id] : []));
  return env.CORE.prepare(
    `${select} where s.brand_id in (select value from json_each(?1))
       or s.id in (select value from json_each(?2)) order by s.name`,
  ).bind(JSON.stringify(brands), JSON.stringify(sites));
};

/** Who is signed in, what they hold, and the sites whose pages they can edit. */
export const describeViewer = async (env: StudioApiEnv, user: Person): Promise<Viewer> => {
  const { access, grants } = await loadAccess(env, user.id);
  const sites = decodeSites(await results(reachableSites(env, access)));
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
};
