import { DefaultRole } from "@repo/contracts/access";
import { NamedScope } from "@repo/contracts/accounts";
import type { Member, People, Person } from "@repo/contracts/studio";
import { Effect, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

import { loadAccess } from "./access.ts";
import { invitePlaces, pendingInvitations } from "./invitations.ts";

const MemberRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  role: DefaultRole,
  scope_kind: Schema.Literals(["organization", "brand", "site"]),
  scope_id: Schema.NullOr(Schema.String),
  scope_name: Schema.String,
});

const decodeScope = Schema.decodeUnknownEffect(NamedScope);

/**
 * The organization's people with their grants, the invitations waiting, and
 * where the person may invite. Only someone who may invite somewhere sees it.
 */
export const organizationPeople = Effect.fn("StudioApi.organizationPeople")(function* (
  person: Person,
) {
  const sql = yield* SqlClient.SqlClient;
  const { access } = yield* loadAccess(person.id);
  const places = yield* invitePlaces(access);
  if (places.length === 0) return { members: [], invitations: [], places } satisfies People;
  const rows = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: MemberRow,
    execute: () => sql`
      select u.id, u.name, u.email, g.role, g.scope_kind, g.scope_id,
        coalesce(b.name, s.name, o.name) as scope_name
      from "user" u
      join grants g on g.user_id = u.id
      left join brands b on g.scope_kind = 'brand' and b.id = g.scope_id
      left join sites s on g.scope_kind = 'site' and s.id = g.scope_id
      cross join organization o
      where g.scope_kind <> 'site' or s.deleted_at is null
      order by u.name, u.id`,
  })(undefined);
  const members = new Map<string, Member>();
  for (const row of rows) {
    const scope = yield* decodeScope(
      row.scope_kind === "organization"
        ? { kind: "organization", name: row.scope_name }
        : { kind: row.scope_kind, id: row.scope_id, name: row.scope_name },
    );
    const member = members.get(row.id) ?? {
      person: { id: row.id, name: row.name, email: row.email },
      grants: [],
    };
    members.set(row.id, { ...member, grants: [...member.grants, { role: row.role, scope }] });
  }
  return {
    members: Array.from(members.values()),
    invitations: yield* pendingInvitations(access),
    places,
  } satisfies People;
});
