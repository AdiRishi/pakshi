import { Permission, RoleId, Scope } from "@repo/contracts/access";
import { EmailAddress } from "@repo/contracts/email";
import { InvitationId } from "@repo/contracts/ids";
import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { studio } from "@/server/studio";

/** The organization's people, the invitations waiting, and where the person may give access. */
export const getPeople = createServerFn({ method: "GET" }).handler(() =>
  studio((client) => client.organizationPeople()),
);

/** Who can work on a brand or a site, and the roles the person may give there. */
export const getScopeMembers = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ scope: Scope })))
  .handler(({ data }) => studio((client) => client.scopeMembers(data)));

export const invitePerson = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(Schema.Struct({ email: EmailAddress, role: RoleId, scope: Scope })),
  )
  .handler(({ data }) => studio((client) => client.invite(data)));

export const withdrawInvitation = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ invitation: InvitationId })))
  .handler(({ data }) => studio((client) => client.revokeInvitation(data)));

export const grantRole = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(Schema.Struct({ person: Schema.String, role: RoleId, scope: Scope })),
  )
  .handler(({ data }) => studio((client) => client.grantRole(data)));

export const changeRole = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({ person: Schema.String, from: RoleId, to: RoleId, scope: Scope }),
    ),
  )
  .handler(({ data }) => studio((client) => client.changeRole(data)));

export const revokeRole = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(Schema.Struct({ person: Schema.String, role: RoleId, scope: Scope })),
  )
  .handler(({ data }) => studio((client) => client.revokeRole(data)));

export const setOverride = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({
        person: Schema.String,
        permission: Permission,
        scope: Scope,
        allowed: Schema.Boolean,
      }),
    ),
  )
  .handler(({ data }) => studio((client) => client.setOverride(data)));

export const removeOverride = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({ person: Schema.String, permission: Permission, scope: Scope }),
    ),
  )
  .handler(({ data }) => studio((client) => client.removeOverride(data)));

export const removeAllAccess = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ person: Schema.String })))
  .handler(({ data }) => studio((client) => client.removeAllAccess(data)));
