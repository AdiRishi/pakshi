import { Permission, type Role, RoleId, type Scope } from "@repo/contracts/access";
import type { Collaborator } from "@repo/contracts/live";
import { now, Timestamp } from "@repo/contracts/release";
import {
  LastOrgAdmin,
  type Member,
  NotPermitted,
  type People,
  type Person,
  PersonNotFound,
  ScopeNotFound,
  type ScopeMembers,
} from "@repo/contracts/studio";
import {
  type Access,
  covers,
  mayGrant,
  mayOverride,
  permissionsOn,
  type Resource,
} from "@repo/domain/access";
import { Effect, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";

import { describeScope, filedUnder, loadAccess, nameScope, scopeOf } from "./access.ts";
import { audit } from "./audit.ts";
import { pendingInvitations } from "./invitations.ts";
import { refreshAccess } from "./live-access.ts";
import { accessPlaces, everyPlace, type Place, placeKey } from "./places.ts";
import { allRoles, findRole, refOf } from "./roles.ts";

/*
 * Who holds what in the organization, and changing it. A person changes only
 * what they could have given: a role whose permissions they all hold, or one
 * permission they hold, on a scope where they manage members. Every change
 * reaches the live connections it affects before the person's next batch.
 */

const scopeColumns = {
  scope_kind: Schema.Literals(["organization", "brand", "site"]),
  scope_id: Schema.NullOr(Schema.String),
};

const GrantRow = Schema.Struct({ user_id: Schema.String, role: RoleId, ...scopeColumns });

const OverrideRow = Schema.Struct({
  user_id: Schema.String,
  permission: Permission,
  allowed: Schema.Literals([0, 1]),
  set_by: Schema.NullOr(
    Schema.fromJsonString(Schema.Struct({ id: Schema.String, name: Schema.String })),
  ),
  set_at: Schema.NullOr(Timestamp),
  ...scopeColumns,
});

const PersonRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  last_active: Schema.NullOr(Timestamp),
});

const scopeIdOf = (scope: Scope) => (scope.kind === "organization" ? null : scope.id);

/** Someone in the organization, or PersonNotFound. */
const findPerson = Effect.fn("StudioApi.findPerson")(function* (id: string) {
  const sql = yield* SqlClient.SqlClient;
  const row = yield* SqlSchema.findOneOption({
    Request: Schema.String,
    Result: Schema.Struct({ id: Schema.String, name: Schema.String }),
    execute: (user) => sql`select id, name from "user" where id = ${user}`,
  })(id);
  if (Option.isNone(row)) return yield* new PersonNotFound({});
  return row.value satisfies Collaborator;
});

/** Everyone's grants and overrides, by person. */
const everyonesAccess = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const [grants, overrides] = yield* Effect.all(
    [
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: GrantRow,
        execute: () => sql`select user_id, role, scope_kind, scope_id from grants`,
      })(undefined),
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: OverrideRow,
        execute: () => sql`select user_id, permission, allowed, set_by, set_at, scope_kind, scope_id
          from permission_overrides`,
      })(undefined),
    ],
    { concurrency: "unbounded" },
  );
  return { grants, overrides };
}).pipe(Effect.withSpan("StudioApi.everyonesAccess"));

/**
 * Refuses a change that would leave no one holding org admin on the
 * organization, since only an org admin can give it back.
 */
const keepAnOrgAdmin = Effect.fn("StudioApi.keepAnOrgAdmin")(function* (person: string) {
  const sql = yield* SqlClient.SqlClient;
  const [other] = yield* sql`select 1 from grants
    where role = 'org-admin' and scope_kind = 'organization' and user_id <> ${person}`;
  if (other === undefined) return yield* new LastOrgAdmin({});
});

const holdsOrgAdmin = (role: RoleId, scope: Scope) =>
  role === "org-admin" && scope.kind === "organization";

/**
 * The organization's people with what they hold and when they were last
 * active, the invitations waiting, and the places the viewer controls. Only
 * someone who controls somewhere sees it.
 */
export const peopleView = Effect.fn("StudioApi.peopleView")(function* (viewer: Person) {
  const sql = yield* SqlClient.SqlClient;
  const { access } = yield* loadAccess(viewer.id);
  const places = yield* accessPlaces(access);
  if (places.length === 0) return { members: [], invitations: [], places } satisfies People;
  const [people, everyone, roles, scopes, invitations] = yield* Effect.all(
    [
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: PersonRow,
        execute: () => sql`select u.id, u.name, u.email, max(s."updatedAt") as last_active
          from "user" u left join session s on s."userId" = u.id
          group by u.id order by u.name, u.id`,
      })(undefined),
      everyonesAccess,
      allRoles,
      everyPlace,
      pendingInvitations(access),
    ],
    { concurrency: "unbounded" },
  );
  const rolesById = new Map(roles.map((role) => [role.id, role]));
  const placeOf = (row: typeof GrantRow.Type | typeof OverrideRow.Type) =>
    Effect.map(scopeOf(row), (scope) => scopes.get(placeKey(scope)));
  const members: Array<Member> = [];
  for (const person of people) {
    const grants = yield* Effect.forEach(
      everyone.grants.filter((grant) => grant.user_id === person.id),
      (grant) => Effect.map(placeOf(grant), (place) => ({ grant, place })),
    );
    const overrides = yield* Effect.forEach(
      everyone.overrides.filter((override) => override.user_id === person.id),
      (override) => Effect.map(placeOf(override), (place) => ({ override, place })),
    );
    members.push({
      person: { id: person.id, name: person.name, email: person.email },
      grants: grants.flatMap(({ grant, place }) => {
        const role = rolesById.get(grant.role);
        return place === undefined || role === undefined
          ? []
          : [
              {
                role: refOf(role),
                scope: place.scope,
                removable: mayGrant(access, role.permissions, place.resource),
              },
            ];
      }),
      overrides: overrides.flatMap(({ override, place }) =>
        place === undefined
          ? []
          : [
              {
                permission: override.permission,
                scope: place.scope,
                allowed: override.allowed === 1,
                setBy: override.set_by,
                setAt: override.set_at,
                removable: mayOverride(access, override.permission, place.resource),
              },
            ],
      ),
      lastActive: person.last_active,
    });
  }
  return { members, invitations, places } satisfies People;
});

/**
 * Who can work on a brand or a site: the roles given on it, which can be
 * changed here, and those that reach it from above. Anyone who holds no
 * permission there is told it doesn't exist.
 */
export const scopeMembers = Effect.fn("StudioApi.scopeMembers")(function* (
  viewer: Person,
  scope: Scope,
) {
  const sql = yield* SqlClient.SqlClient;
  const described = yield* describeScope(scope);
  const { access } = yield* loadAccess(viewer.id);
  if (permissionsOn(access, described.resource).length === 0) return yield* new ScopeNotFound({});
  const [rows, roles, scopes] = yield* Effect.all(
    [
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: Schema.Struct({ ...GrantRow.fields, name: Schema.String, email: Schema.String }),
        execute: () => sql`select g.user_id, g.role, g.scope_kind, g.scope_id, u.name, u.email
          from grants g join "user" u on u.id = g.user_id order by u.name, u.id`,
      })(undefined),
      allRoles,
      everyPlace,
    ],
    { concurrency: "unbounded" },
  );
  const rolesById = new Map(roles.map((role) => [role.id, role]));
  const here = placeKey(scope);
  const direct: Array<ScopeMembers["direct"][number]> = [];
  const inherited: Array<ScopeMembers["inherited"][number]> = [];
  for (const row of rows) {
    const granted = yield* scopeOf(row);
    const from = scopes.get(placeKey(granted));
    const role = rolesById.get(row.role);
    if (from === undefined || role === undefined || !covers(granted, described.resource)) continue;
    const person = { id: row.user_id, name: row.name, email: row.email };
    if (placeKey(granted) === here)
      direct.push({
        person,
        role: refOf(role),
        removable: mayGrant(access, role.permissions, described.resource),
      });
    else inherited.push({ person, role: refOf(role), from: from.scope });
  }
  return {
    scope: nameScope(scope, described.name),
    direct,
    inherited,
    roles: roles
      .filter((role) => mayGrant(access, role.permissions, described.resource))
      .map(refOf),
  } satisfies ScopeMembers;
});

/** The person making a change, the scope it's on, and refusing it unless they could make it. */
const changing = Effect.fn("StudioApi.changing")(function* (
  viewer: Person,
  scope: Scope,
  allowed: (access: Access, resource: Resource) => boolean,
  action: string,
) {
  const described = yield* describeScope(scope);
  const { access } = yield* loadAccess(viewer.id);
  if (!allowed(access, described.resource)) return yield* new NotPermitted({ action });
  return { scope: nameScope(scope, described.name) };
});

const insertGrant = Effect.fn("StudioApi.insertGrant")(function* (
  person: string,
  role: RoleId,
  scope: Scope,
) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql`insert or ignore into grants (user_id, role, scope_kind, scope_id)
    values (${person}, ${role}, ${scope.kind}, ${scopeIdOf(scope)}) returning user_id`;
  return rows.length > 0;
});

const deleteGrant = Effect.fn("StudioApi.deleteGrant")(function* (
  person: string,
  role: RoleId,
  scope: Scope,
) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql`delete from grants where user_id = ${person} and role = ${role}
    and scope_kind = ${scope.kind} and coalesce(scope_id, '') = ${scopeIdOf(scope) ?? ""}
    returning user_id`;
  return rows.length > 0;
});

/** Gives someone a role on a scope, if the viewer could give it there. */
export const grantRoleTo = Effect.fn("StudioApi.grantRoleTo")(function* (
  viewer: Person,
  personId: string,
  roleId: RoleId,
  scope: Scope,
) {
  const [person, role] = yield* Effect.all([findPerson(personId), findRole(roleId)]);
  const { scope: named } = yield* changing(
    viewer,
    scope,
    (access, resource) => mayGrant(access, role.permissions, resource),
    "give this role here",
  );
  if (yield* insertGrant(person.id, role.id, scope))
    yield* audit(viewer, filedUnder(scope), {
      _tag: "RoleGranted",
      person,
      role: refOf(role),
      scope: named,
    });
  yield* refreshAccess([{ person: person.id, scope }]);
});

/** Takes a role on a scope away from someone, if the viewer could have given it there. */
export const revokeRoleFrom = Effect.fn("StudioApi.revokeRoleFrom")(function* (
  viewer: Person,
  personId: string,
  roleId: RoleId,
  scope: Scope,
) {
  const [person, role] = yield* Effect.all([findPerson(personId), findRole(roleId)]);
  const { scope: named } = yield* changing(
    viewer,
    scope,
    (access, resource) => mayGrant(access, role.permissions, resource),
    "take this role away here",
  );
  if (holdsOrgAdmin(role.id, scope)) yield* keepAnOrgAdmin(person.id);
  if (yield* deleteGrant(person.id, role.id, scope))
    yield* audit(viewer, filedUnder(scope), {
      _tag: "RoleRevoked",
      person,
      role: refOf(role),
      scope: named,
    });
  yield* refreshAccess([{ person: person.id, scope }]);
});

/** Gives someone one role on a scope in place of another, if the viewer could give both there. */
export const changeRoleOf = Effect.fn("StudioApi.changeRoleOf")(function* (
  viewer: Person,
  personId: string,
  fromId: RoleId,
  toId: RoleId,
  scope: Scope,
) {
  const [person, from, to] = yield* Effect.all([
    findPerson(personId),
    findRole(fromId),
    findRole(toId),
  ]);
  const { scope: named } = yield* changing(
    viewer,
    scope,
    (access, resource) =>
      mayGrant(access, from.permissions, resource) && mayGrant(access, to.permissions, resource),
    "change this role here",
  );
  if (holdsOrgAdmin(from.id, scope)) yield* keepAnOrgAdmin(person.id);
  const changes: Array<[Role, "RoleRevoked" | "RoleGranted"]> = [];
  if (yield* insertGrant(person.id, to.id, scope)) changes.push([to, "RoleGranted"]);
  if (yield* deleteGrant(person.id, from.id, scope)) changes.push([from, "RoleRevoked"]);
  for (const [role, tag] of changes)
    yield* audit(viewer, filedUnder(scope), { _tag: tag, person, role: refOf(role), scope: named });
  yield* refreshAccess([{ person: person.id, scope }]);
});

/** Switches a permission on or off for someone on a scope, if the viewer holds it there. */
export const setOverrideFor = Effect.fn("StudioApi.setOverrideFor")(function* (
  viewer: Person,
  personId: string,
  permission: Permission,
  scope: Scope,
  allowed: boolean,
) {
  const sql = yield* SqlClient.SqlClient;
  const person = yield* findPerson(personId);
  const { scope: named } = yield* changing(
    viewer,
    scope,
    (access, resource) => mayOverride(access, permission, resource),
    "switch this permission here",
  );
  const by = JSON.stringify({ id: viewer.id, name: viewer.name });
  yield* sql`insert into permission_overrides
      (user_id, permission, scope_kind, scope_id, allowed, set_by, set_at)
    values (${person.id}, ${permission}, ${scope.kind}, ${scopeIdOf(scope)}, ${allowed ? 1 : 0},
      ${by}, ${now()})
    on conflict (user_id, permission, scope_kind, coalesce(scope_id, '')) do update
      set allowed = excluded.allowed, set_by = excluded.set_by, set_at = excluded.set_at`;
  yield* audit(viewer, filedUnder(scope), {
    _tag: "OverrideSet",
    person,
    permission,
    scope: named,
    allowed,
  });
  yield* refreshAccess([{ person: person.id, scope }]);
});

/** Removes an override, so someone's roles decide the permission again. */
export const removeOverrideFor = Effect.fn("StudioApi.removeOverrideFor")(function* (
  viewer: Person,
  personId: string,
  permission: Permission,
  scope: Scope,
) {
  const sql = yield* SqlClient.SqlClient;
  const person = yield* findPerson(personId);
  const { scope: named } = yield* changing(
    viewer,
    scope,
    (access, resource) => mayOverride(access, permission, resource),
    "remove this override",
  );
  const removed = yield* sql`delete from permission_overrides
    where user_id = ${person.id} and permission = ${permission} and scope_kind = ${scope.kind}
      and coalesce(scope_id, '') = ${scopeIdOf(scope) ?? ""} returning user_id`;
  if (removed.length > 0)
    yield* audit(viewer, filedUnder(scope), {
      _tag: "OverrideRemoved",
      person,
      permission,
      scope: named,
    });
  yield* refreshAccess([{ person: person.id, scope }]);
});

/**
 * Takes away every role and override someone holds, when the viewer could
 * take away each of them.
 */
export const removeAllAccessOf = Effect.fn("StudioApi.removeAllAccessOf")(function* (
  viewer: Person,
  personId: string,
) {
  const sql = yield* SqlClient.SqlClient;
  const person = yield* findPerson(personId);
  const [{ access }, everyone, roles, scopes] = yield* Effect.all(
    [loadAccess(viewer.id), everyonesAccess, allRoles, everyPlace],
    { concurrency: "unbounded" },
  );
  const rolesById = new Map(roles.map((role) => [role.id, role]));
  const grants = yield* Effect.forEach(
    everyone.grants.filter((grant) => grant.user_id === person.id),
    (grant) => Effect.map(scopeOf(grant), (scope) => ({ role: grant.role, scope })),
  );
  const overrides = yield* Effect.forEach(
    everyone.overrides.filter((override) => override.user_id === person.id),
    (override) =>
      Effect.map(scopeOf(override), (scope) => ({ permission: override.permission, scope })),
  );
  const placeOf = (scope: Scope): Place | undefined => scopes.get(placeKey(scope));
  const removable =
    grants.every(({ role, scope }) => {
      const place = placeOf(scope);
      const held = rolesById.get(role);
      return (
        place === undefined ||
        (held !== undefined && mayGrant(access, held.permissions, place.resource))
      );
    }) &&
    overrides.every(({ permission, scope }) => {
      const place = placeOf(scope);
      return place === undefined || mayOverride(access, permission, place.resource);
    });
  if (!removable)
    return yield* new NotPermitted({ action: "take away all of this person's access" });
  if (grants.some(({ role, scope }) => holdsOrgAdmin(role, scope)))
    yield* keepAnOrgAdmin(person.id);
  yield* sql`delete from grants where user_id = ${person.id}`;
  yield* sql`delete from permission_overrides where user_id = ${person.id}`;
  for (const { role, scope } of grants) {
    const held = rolesById.get(role);
    const place = placeOf(scope);
    if (held !== undefined && place !== undefined)
      yield* audit(viewer, filedUnder(scope), {
        _tag: "RoleRevoked",
        person,
        role: refOf(held),
        scope: place.scope,
      });
  }
  for (const { permission, scope } of overrides) {
    const place = placeOf(scope);
    if (place !== undefined)
      yield* audit(viewer, filedUnder(scope), {
        _tag: "OverrideRemoved",
        person,
        permission,
        scope: place.scope,
      });
  }
  yield* refreshAccess([{ person: person.id, scope: { kind: "organization" } }]);
});
