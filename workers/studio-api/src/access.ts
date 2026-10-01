import { Scope } from "@repo/contracts/access";
import { BrandId } from "@repo/contracts/ids";
import { ScopeNotFound } from "@repo/contracts/studio";
import { type Access, Grant, Override, type Resource } from "@repo/domain/access";
import { Effect, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

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

const ScopeNameRow = Schema.Struct({ name: Schema.String, brand_id: Schema.NullOr(BrandId) });

/**
 * A scope's name, its brand for a site, and what it is for permission checks,
 * or ScopeNotFound when it doesn't exist.
 */
export const describeScope = Effect.fn("StudioApi.describeScope")(function* (scope: Scope) {
  const sql = yield* SqlClient.SqlClient;
  const row = yield* SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: ScopeNameRow,
    execute: () => {
      switch (scope.kind) {
        case "organization":
          return sql`select name, null as brand_id from organization`;
        case "brand":
          return sql`select name, null as brand_id from brands where id = ${scope.id}`;
        case "site":
          return sql`select name, brand_id from sites where id = ${scope.id}`;
      }
    },
  })(undefined);
  if (Option.isNone(row)) return yield* new ScopeNotFound({});
  const brand = row.value.brand_id;
  const resource: Resource =
    scope.kind === "site" && brand !== null
      ? { kind: "site", id: scope.id, brand }
      : scope.kind === "brand"
        ? { kind: "brand", id: scope.id }
        : { kind: "organization" };
  return { name: row.value.name, brand, resource };
});
