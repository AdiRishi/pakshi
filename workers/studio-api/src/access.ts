import { Scope } from "@repo/contracts/access";
import { type Access, Grant, Override } from "@repo/domain/access";
import { Effect, Schema } from "effect";
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
