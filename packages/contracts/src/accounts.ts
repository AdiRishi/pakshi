import { Schema } from "effect";

import { RoleRef, type Scope } from "./access.ts";
import { EmailAddress } from "./email.ts";
import { BrandId, InvitationId, SiteId } from "./ids.ts";
import { Collaborator } from "./live.ts";
import { Timestamp } from "./release.ts";

/** Where Better Auth answers in studio-api, for signing in and out and resetting passwords. */
export const authBasePath = "/api/auth";

/**
 * Where studio-api makes accounts: setting up the organization, and joining
 * it from an invitation. Each signs the new person in, so Studio forwards the
 * request as plain HTTP for its cookies, as it does sign-in.
 */
export const accountsBasePath = "/api/accounts";
export const accountsPaths = {
  setUp: `${accountsBasePath}/set-up`,
  join: `${accountsBasePath}/join`,
} as const;

const trimmed = (min: number, max: number, message: string) =>
  Schema.Trim.check(
    Schema.isMinLength(min, { message }),
    Schema.isMaxLength(max, { message: `Use at most ${max} characters` }),
  );

export const OrganizationName = trimmed(1, 80, "Name the organization");
export const PersonName = trimmed(1, 80, "Enter your name");

export const passwordLength = { min: 10, max: 128 } as const;

export const Password = Schema.String.check(
  Schema.isMinLength(passwordLength.min, {
    message: `Use at least ${passwordLength.min} characters`,
  }),
  Schema.isMaxLength(passwordLength.max, {
    message: `Use at most ${passwordLength.max} characters`,
  }),
);

/** The secret in an invitation's link. Only its hash is stored. */
export const InvitationToken = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9]{32,64}$/)).pipe(
  Schema.brand("InvitationToken"),
);
export type InvitationToken = typeof InvitationToken.Type;

/** The first person's account, and the organization they set up with it. */
export const SetUp = Schema.Struct({
  organization: OrganizationName,
  name: PersonName,
  email: EmailAddress,
  password: Password,
});
export type SetUp = typeof SetUp.Type;

/** A new account for the address an invitation was sent to. */
export const Join = Schema.Struct({ token: InvitationToken, name: PersonName, password: Password });
export type Join = typeof Join.Type;

/** Why making an account was refused. */
export const AccountRefusal = Schema.Struct({
  reason: Schema.Literals([
    /** The organization is set up already, so only invited people can join. */
    "set-up",
    /** The invitation was used, revoked or has expired. */
    "invitation",
    /** An account with this email address exists, so its owner signs in to accept. */
    "account-exists",
    /** The details don't meet the rules, such as a password too short. */
    "invalid",
  ]),
});
export type AccountRefusal = typeof AccountRefusal.Type;

/** The place a grant applies to, named as people know it. */
export const NamedScope = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("organization"), name: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("brand"), id: BrandId, name: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("site"), id: SiteId, name: Schema.String }),
]);
export type NamedScope = typeof NamedScope.Type;

/** A named scope as grants and workflows name it, without its name. */
export const scopeOf = (scope: NamedScope): Scope => {
  switch (scope.kind) {
    case "organization":
      return { kind: "organization" };
    case "brand":
      return { kind: "brand", id: scope.id };
    case "site":
      return { kind: "site", id: scope.id };
  }
};

/** An invitation waiting for its person, as the people screen lists it. */
export const PendingInvitation = Schema.Struct({
  id: InvitationId,
  email: EmailAddress,
  role: RoleRef,
  scope: NamedScope,
  invitedBy: Collaborator,
  expiresAt: Timestamp,
});
export type PendingInvitation = typeof PendingInvitation.Type;

/** What an invitation's link shows the person it was sent to. */
export const InvitationView = Schema.TaggedUnion({
  Open: {
    organization: Schema.String,
    email: EmailAddress,
    role: RoleRef,
    scope: NamedScope,
    invitedBy: Collaborator,
    /** Whether an account with the invitation's address exists, so they sign in rather than join. */
    accountExists: Schema.Boolean,
  },
  /** Used, revoked, expired or never made. They all look the same. */
  Closed: {},
});
export type InvitationView = typeof InvitationView.Type;
