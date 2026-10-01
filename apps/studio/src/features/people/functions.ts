import { DefaultRole, Scope } from "@repo/contracts/access";
import { EmailAddress } from "@repo/contracts/accounts";
import { InvitationId } from "@repo/contracts/ids";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { type Effect, Schema } from "effect";

import { callStudio, type StudioClient } from "@/server/studio-rpc";

const studio = <A, E>(use: (client: StudioClient) => Effect.Effect<A, E>) =>
  callStudio({ binding: env.STUDIO_RPC, request: getRequest() }, use);

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
