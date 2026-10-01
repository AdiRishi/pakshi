import { DefaultRole, Scope } from "@repo/contracts/access";
import { EmailAddress } from "@repo/contracts/email";
import { InvitationId } from "@repo/contracts/ids";
import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { studio } from "@/server/studio";

/** The organization's people, the invitations waiting, and where the person may invite. */
export const getPeople = createServerFn({ method: "GET" }).handler(() =>
  studio((client) => client.organizationPeople()),
);

export const invitePerson = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({ email: EmailAddress, role: DefaultRole, scope: Scope }),
    ),
  )
  .handler(({ data }) => studio((client) => client.invite(data)));

export const withdrawInvitation = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ invitation: InvitationId })))
  .handler(({ data }) => studio((client) => client.revokeInvitation(data)));
