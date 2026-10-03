import type { RoleId, Scope } from "@repo/contracts/access";
import type { Collaborator } from "@repo/contracts/live";
import { Effect, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";

import { audit } from "./audit.ts";

/*
 * The organization this deployment of Pakshi serves, and the grants that let
 * its people in. A stage has no organization until its first person sets it
 * up, and one at most after.
 */

/** The organization's name, or none on a stage nobody has set up. */
export const organizationName = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const row = yield* SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: Schema.Struct({ name: Schema.String }),
    execute: () => sql`select name from organization`,
  })(undefined);
  return Option.map(row, ({ name }) => name);
}).pipe(Effect.withSpan("StudioApi.organizationName"));

/**
 * Records the organization with its first admin. Returns false when someone
 * set it up first, which leaves theirs in place.
 */
export const startOrganization = Effect.fn("StudioApi.startOrganization")(function* (
  name: string,
  admin: Collaborator,
) {
  const sql = yield* SqlClient.SqlClient;
  const started = yield* sql`insert into organization (id, name) values (1, ${name})
    on conflict (id) do nothing returning id`;
  if (started.length === 0) return false;
  yield* grantRole(admin.id, "org-admin", { kind: "organization" });
  yield* audit(admin, {}, { _tag: "OrganizationSetUp", name });
  return true;
});

/** Gives a person a role on a scope. Holding it already changes nothing. */
export const grantRole = Effect.fn("StudioApi.grantRole")(function* (
  user: string,
  role: RoleId,
  scope: Scope,
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`insert or ignore into grants (user_id, role, scope_kind, scope_id)
    values (${user}, ${role}, ${scope.kind}, ${scope.kind === "organization" ? null : scope.id})`;
});
