import {
  type CustomRole,
  DefaultRole,
  Permission,
  type Role,
  RoleId,
  type RoleRef,
} from "@repo/contracts/access";
import { CustomRoleId, randomId } from "@repo/contracts/ids";
import { now } from "@repo/contracts/release";
import {
  NotPermitted,
  type Person,
  RoleInUse,
  RoleNameTaken,
  RoleNotFound,
  type RolesView,
} from "@repo/contracts/studio";
import { defaultRole, isDefaultRole, mayDefineRole, permissionsOn } from "@repo/domain/access";
import { Effect, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

import { loadAccess, namedScopeOf, scopeOf } from "./access.ts";
import { audit } from "./audit.ts";
import { refreshAccess } from "./live-access.ts";

/*
 * Roles: the default roles Pakshi ships, in code, and the custom roles the
 * organization's admins make, as rows in D1. A custom role's permissions
 * apply wherever it's granted the moment it's saved.
 */

const CustomRoleRow = Schema.Struct({
  id: CustomRoleId,
  name: Schema.String,
  description: Schema.String,
  permissions: Schema.fromJsonString(Schema.Array(Permission)),
});

const encodePermissions = Schema.encodeEffect(Schema.fromJsonString(Schema.Array(Permission)));

/** Every role, the default ones first, then the custom ones by name. */
export const allRoles = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const custom = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: CustomRoleRow,
    execute: () => sql`select id, name, description, permissions from roles order by name`,
  })(undefined);
  return [...DefaultRole.literals.map(defaultRole), ...custom] satisfies ReadonlyArray<Role>;
}).pipe(Effect.withSpan("StudioApi.allRoles"));

/** A role by its ID, or RoleNotFound. */
export const findRole = Effect.fn("StudioApi.findRole")(function* (id: RoleId) {
  if (isDefaultRole(id)) return defaultRole(id);
  const sql = yield* SqlClient.SqlClient;
  const row = yield* SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: CustomRoleRow,
    execute: () => sql`select id, name, description, permissions from roles where id = ${id}`,
  })(undefined);
  if (Option.isNone(row)) return yield* new RoleNotFound({});
  return row.value satisfies Role;
});

export const refOf = (role: Role): RoleRef => ({ id: role.id, name: role.name });

const HolderRow = Schema.Struct({
  role: RoleId,
  id: Schema.String,
  name: Schema.String,
  scope_kind: Schema.Literals(["organization", "brand", "site"]),
  scope_id: Schema.NullOr(Schema.String),
  scope_name: Schema.String,
});

/**
 * Every role with the people who hold it and where, for anyone signed in.
 * Only someone who may manage roles can change them, and they can put in a
 * role only the permissions they hold across the organization.
 */
export const rolesView = Effect.fn("StudioApi.rolesView")(function* (person: Person) {
  const sql = yield* SqlClient.SqlClient;
  const [roles, holders, { access }] = yield* Effect.all(
    [
      allRoles,
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: HolderRow,
        execute: () => sql`select g.role, u.id, u.name, g.scope_kind, g.scope_id,
            coalesce(b.name, s.name, o.name) as scope_name
          from grants g join "user" u on u.id = g.user_id
          left join brands b on g.scope_kind = 'brand' and b.id = g.scope_id
          left join sites s on g.scope_kind = 'site' and s.id = g.scope_id
          cross join organization o
          where g.scope_kind <> 'site' or s.deleted_at is null
          order by u.name`,
      })(undefined),
      loadAccess(person.id),
    ],
    { concurrency: "unbounded" },
  );
  const named = yield* Effect.forEach(holders, (holder) =>
    Effect.map(namedScopeOf(holder), (scope) => ({
      role: holder.role,
      person: { id: holder.id, name: holder.name },
      scope,
    })),
  );
  return {
    roles: roles.map((role) => ({
      role,
      holders: named
        .filter((holder) => holder.role === role.id)
        .map(({ person, scope }) => ({ person, scope })),
    })),
    can: { manage: mayDefineRole(access, []) },
    permissions: mayDefineRole(access, []) ? permissionsOn(access, { kind: "organization" }) : [],
  } satisfies RolesView;
});

/** Refuses a name another role has, the default roles included. */
const ensureNameFree = Effect.fn("StudioApi.ensureNameFree")(function* (
  name: string,
  except: CustomRoleId | null,
) {
  const sql = yield* SqlClient.SqlClient;
  const lower = name.toLowerCase();
  const defaults = DefaultRole.literals.some((id) => defaultRole(id).name.toLowerCase() === lower);
  const [custom] = yield* sql`select 1 from roles
    where lower(name) = ${lower} and id <> ${except ?? ""}`;
  if (defaults || custom !== undefined) return yield* new RoleNameTaken({ name });
});

/**
 * Makes a custom role, or with an ID, changes one. Changing a role changes
 * what everyone holding it may do, so the person needs every permission it
 * held and every permission it holds now. Returns the role and the people
 * whose access changed.
 */
export const saveRole = Effect.fn("StudioApi.saveRole")(function* (
  person: Person,
  id: CustomRoleId | null,
  details: {
    readonly name: string;
    readonly description: string;
    readonly permissions: ReadonlyArray<Permission>;
  },
) {
  const sql = yield* SqlClient.SqlClient;
  const { access } = yield* loadAccess(person.id);
  const permissions = Permission.literals.filter((permission) =>
    details.permissions.includes(permission),
  );
  const before = id === null ? null : yield* findRole(id);
  if (!mayDefineRole(access, [...permissions, ...(before?.permissions ?? [])]))
    return yield* new NotPermitted({ action: "give a role permissions you don't hold" });
  yield* ensureNameFree(details.name, id);
  const encoded = yield* encodePermissions(permissions);
  const role: CustomRole = {
    id: id ?? CustomRoleId.make(randomId("role")),
    name: details.name,
    description: details.description,
    permissions,
  };
  if (before === null) {
    yield* sql`insert into roles (id, name, description, permissions, created_by)
      values (${role.id}, ${role.name}, ${role.description}, ${encoded}, ${person.id})`;
    yield* audit(person, {}, { _tag: "RoleCreated", role: refOf(role), permissions });
    return role;
  }
  yield* sql`update roles set name = ${role.name}, description = ${role.description},
    permissions = ${encoded}, updated_at = ${now()} where id = ${role.id}`;
  const holders = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: Schema.Struct({
      user_id: Schema.String,
      scope_kind: Schema.Literals(["organization", "brand", "site"]),
      scope_id: Schema.NullOr(Schema.String),
    }),
    execute: () => sql`select user_id, scope_kind, scope_id from grants where role = ${role.id}`,
  })(undefined);
  yield* refreshAccess(
    yield* Effect.forEach(holders, (holder) =>
      Effect.map(scopeOf(holder), (scope) => ({ person: holder.user_id, scope })),
    ),
  );
  const added = permissions.filter((permission) => !before.permissions.includes(permission));
  const removed = before.permissions.filter((permission) => !permissions.includes(permission));
  yield* audit(person, {}, { _tag: "RoleChanged", role: refOf(role), added, removed });
  return role;
});

/**
 * Deletes a custom role nobody holds and no workflow names. Someone could
 * otherwise lose access, or a step its approvers, without being asked.
 */
export const deleteRole = Effect.fn("StudioApi.deleteRole")(function* (
  person: Person,
  id: CustomRoleId,
) {
  const sql = yield* SqlClient.SqlClient;
  const role = yield* findRole(id);
  const { access } = yield* loadAccess(person.id);
  if (!mayDefineRole(access, role.permissions))
    return yield* new NotPermitted({ action: "delete this role" });
  const [held] = yield* sql`select 1 from grants where role = ${id}
    union all select 1 from invitations where role = ${id} and accepted_at is null`;
  const [named] = yield* sql`select 1 from workflows, json_each(workflows.steps) as step,
    json_each(step.value, '$.roles') as role
    where json_extract(role.value, '$.id') = ${id}`;
  if (held !== undefined || named !== undefined) return yield* new RoleInUse({});
  yield* sql`delete from roles where id = ${id}`;
  yield* audit(person, {}, { _tag: "RoleDeleted", role: refOf(role) });
});
