import { RoleId, Scope } from "@repo/contracts/access";
import { InvitationToken, type InvitationView, PendingInvitation } from "@repo/contracts/accounts";
import type { EmailAddress } from "@repo/contracts/email";
import { InvitationId, randomId } from "@repo/contracts/ids";
import { Collaborator } from "@repo/contracts/live";
import { now, Timestamp } from "@repo/contracts/release";
import { AlreadyMember, InvitationClosed, NotPermitted, type Person } from "@repo/contracts/studio";
import { type Access, authorize, mayGrant } from "@repo/domain/access";
import { Effect, Option, Schema } from "effect";
import { Hex } from "effect/encoding";
import { SqlClient, SqlSchema } from "effect/sql";

import { describeScope, filedUnder, loadAccess, nameScope, scopeOf } from "./access.ts";
import { audit } from "./audit.ts";
import type { Mailer } from "./notifications.ts";
import { grantRole, organizationName } from "./organization.ts";
import { findRole, refOf } from "./roles.ts";

/*
 * Invitations to join the organization, each with the grant its person gets
 * on accepting. The link carries a random token; D1 keeps only its hash, so a
 * copy of the database can't be used to join.
 */

/** How long an invitation's link works. */
const invitationDays = 14;

const tokenAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** A new token: 40 base-62 digits, about 238 random bits. */
const newToken = () =>
  InvitationToken.make(
    Array.from(crypto.getRandomValues(new Uint8Array(40)), (byte) => tokenAlphabet[byte % 62]).join(
      "",
    ),
  );

const hashOf = (token: InvitationToken) =>
  Effect.promise(async () => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return Hex.encode(new Uint8Array(digest));
  });

const InvitationRow = Schema.Struct({
  id: InvitationId,
  email: Schema.String,
  role: RoleId,
  scope_kind: Schema.Literals(["organization", "brand", "site"]),
  scope_id: Schema.NullOr(Schema.String),
  invited_by: Schema.fromJsonString(Collaborator),
  expires_at: Timestamp,
});
type InvitationRow = typeof InvitationRow.Type;

const named = Effect.fn("StudioApi.namedScope")(function* (scope: Scope) {
  const { name } = yield* describeScope(scope);
  return nameScope(scope, name);
});

const pendingOf = Effect.fn("StudioApi.pendingOf")(function* (row: InvitationRow) {
  return {
    id: row.id,
    email: row.email,
    // A role can't be deleted while an invitation names it.
    role: refOf(yield* Effect.orDie(findRole(row.role))),
    scope: yield* named(yield* scopeOf(row)),
    invitedBy: row.invited_by,
    expiresAt: row.expires_at,
  } satisfies PendingInvitation;
});

/** The invitation a token opens, while it's unused and unexpired. */
const openInvitation = Effect.fn("StudioApi.openInvitation")(function* (token: InvitationToken) {
  const sql = yield* SqlClient.SqlClient;
  const hash = yield* hashOf(token);
  return yield* SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: InvitationRow,
    execute: () => sql`select id, email, role, scope_kind, scope_id, invited_by, expires_at
      from invitations
      where token_hash = ${hash} and accepted_at is null and expires_at > ${now()}`,
  })(undefined);
});

/**
 * Invites someone by email to hold a role on a scope, and emails them the
 * link, which is returned for the inviter to copy too. `studio` is Studio's
 * address, which the link points at.
 */
export const invite = Effect.fn("StudioApi.invite")(function* (
  mailer: Mailer,
  person: Person,
  email: EmailAddress,
  roleId: RoleId,
  scope: Scope,
  studio: string,
) {
  const sql = yield* SqlClient.SqlClient;
  const described = yield* describeScope(scope);
  const { access } = yield* loadAccess(person.id);
  const role = yield* findRole(roleId);
  if (!mayGrant(access, role.permissions, described.resource))
    return yield* new NotPermitted({ action: "give this role here" });
  const address = email.toLowerCase();
  const scopeId = scope.kind === "organization" ? null : scope.id;
  const held = yield* sql`select 1 from grants g join "user" u on u.id = g.user_id
    where lower(u.email) = ${address} and g.role = ${role.id} and g.scope_kind = ${scope.kind}
      and coalesce(g.scope_id, '') = ${scopeId ?? ""}`;
  if (held.length > 0) return yield* new AlreadyMember({});
  const token = newToken();
  const createdAt = now();
  const row: InvitationRow = {
    id: InvitationId.make(randomId("inv")),
    email: address,
    role: role.id,
    scope_kind: scope.kind,
    scope_id: scopeId,
    invited_by: { id: person.id, name: person.name },
    expires_at: Timestamp.make(
      new Date(Date.parse(createdAt) + invitationDays * 24 * 60 * 60 * 1000).toISOString(),
    ),
  };
  yield* sql`insert into invitations
      (id, token_hash, email, role, scope_kind, scope_id, invited_by, created_at, expires_at)
    values (${row.id}, ${yield* hashOf(token)}, ${row.email}, ${role.id}, ${scope.kind}, ${scopeId},
      ${yield* Schema.encodeEffect(Schema.fromJsonString(Collaborator))(row.invited_by)}, ${createdAt},
      ${row.expires_at})`;
  const link = `${studio}/join/${token}`;
  const organization = Option.getOrElse(yield* organizationName, () => "Pakshi");
  yield* Effect.promise(() =>
    mailer.send({
      from: mailer.from,
      to: address,
      subject: `${person.name} invited you to ${organization} on Pakshi`,
      text: `Hello,\n\n${person.name} invited you to work on ${described.name} in Pakshi, where ${organization} builds and updates its websites.\n\nAccept the invitation:\n\n${link}\n\nThe link works for ${invitationDays} days.\n`,
    }),
  );
  const invitation = yield* pendingOf(row);
  yield* audit(person, filedUnder(scope), {
    _tag: "Invited",
    email: invitation.email,
    role: invitation.role,
    scope: invitation.scope,
  });
  return { invitation, link };
});

/** The invitations waiting on the scopes a person manages, newest first. */
export const pendingInvitations = Effect.fn("StudioApi.pendingInvitations")(function* (
  access: Access,
) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: InvitationRow,
    execute: () => sql`select id, email, role, scope_kind, scope_id, invited_by, expires_at
      from invitations where accepted_at is null and expires_at > ${now()}
      order by created_at desc`,
  })(undefined);
  const shown = yield* Effect.filter(rows, (row) =>
    Effect.gen(function* () {
      const described = yield* Effect.option(describeScope(yield* scopeOf(row)));
      return (
        Option.isSome(described) && authorize(access, "members.manage", described.value.resource)
      );
    }),
  );
  // Each scope was found just now, and scopes are never removed.
  return yield* Effect.forEach(shown, (row) => Effect.orDie(pendingOf(row)));
});

/** Withdraws an invitation, for someone who manages the members of its scope. */
export const revokeInvitation = Effect.fn("StudioApi.revokeInvitation")(function* (
  person: Person,
  id: InvitationId,
) {
  const sql = yield* SqlClient.SqlClient;
  const row = yield* SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: InvitationRow,
    execute: () => sql`select id, email, role, scope_kind, scope_id, invited_by, expires_at
      from invitations where id = ${id} and accepted_at is null`,
  })(undefined);
  if (Option.isNone(row)) return;
  // An invitation to a site deleted since is listed nowhere, so nobody withdraws it.
  const described = yield* describeScope(yield* scopeOf(row.value)).pipe(
    Effect.catchTag("ScopeNotFound", () =>
      Effect.fail(new NotPermitted({ action: "withdraw this invitation" })),
    ),
  );
  const { access } = yield* loadAccess(person.id);
  if (!authorize(access, "members.manage", described.resource))
    return yield* new NotPermitted({ action: "withdraw this invitation" });
  yield* sql`delete from invitations where id = ${id}`;
  const withdrawn = yield* Effect.orDie(pendingOf(row.value));
  yield* audit(person, filedUnder(yield* scopeOf(row.value)), {
    _tag: "InvitationWithdrawn",
    email: withdrawn.email,
    role: withdrawn.role,
    scope: withdrawn.scope,
  });
});

/** What an invitation's link shows: who it's for and what it gives, or that it's closed. */
export const invitationView = Effect.fn("StudioApi.invitationView")(function* (
  token: InvitationToken,
) {
  const sql = yield* SqlClient.SqlClient;
  const row = yield* openInvitation(token);
  const organization = yield* organizationName;
  if (Option.isNone(row) || Option.isNone(organization))
    return { _tag: "Closed" } satisfies InvitationView;
  const accounts = yield* sql`select 1 from "user" where lower(email) = ${row.value.email}`;
  const pending = yield* Effect.orDie(pendingOf(row.value));
  return {
    _tag: "Open",
    organization: organization.value,
    email: pending.email,
    role: pending.role,
    scope: pending.scope,
    invitedBy: pending.invitedBy,
    accountExists: accounts.length > 0,
  } satisfies InvitationView;
});

/**
 * The open invitation a token names, for an account about to be made from
 * it. Fails when it's closed.
 */
export const invitationToJoin = Effect.fn("StudioApi.invitationToJoin")(function* (
  token: InvitationToken,
) {
  const row = yield* openInvitation(token);
  if (Option.isNone(row)) return yield* new InvitationClosed({});
  return row.value;
});

/**
 * Gives a person an invitation's grant and closes it. The invitation must be
 * open and sent to their own address, so a forwarded link is no use to anyone
 * else.
 */
export const acceptInvitation = Effect.fn("StudioApi.acceptInvitation")(function* (
  person: Person,
  token: InvitationToken,
) {
  const sql = yield* SqlClient.SqlClient;
  const row = yield* invitationToJoin(token);
  if (row.email !== person.email.toLowerCase()) return yield* new InvitationClosed({});
  const closed = yield* sql`update invitations set accepted_at = ${now()}
    where id = ${row.id} and accepted_at is null returning id`;
  if (closed.length === 0) return yield* new InvitationClosed({});
  // An invitation to a site deleted since it was sent is closed with it.
  const accepted = yield* pendingOf(row).pipe(
    Effect.catchTag("ScopeNotFound", () => Effect.fail(new InvitationClosed({}))),
  );
  const scope = yield* scopeOf(row);
  yield* grantRole(person.id, row.role, scope);
  yield* audit(person, filedUnder(scope), {
    _tag: "InvitationAccepted",
    role: accepted.role,
    scope: accepted.scope,
  });
});
