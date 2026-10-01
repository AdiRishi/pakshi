import { InvitationToken } from "@repo/contracts/accounts";
import { createServerFn } from "@tanstack/react-start";
import { Effect, Schema } from "effect";

import { studio } from "@/server/studio";

/** The signed-in person, or null when nobody is signed in. */
export const getViewer = createServerFn({ method: "GET" }).handler(() =>
  studio((client) =>
    client.viewer().pipe(Effect.catchTag("Unauthenticated", () => Effect.succeed(null))),
  ),
);

/** The organization's name, or null before anyone has set Pakshi up. */
export const getOrganization = createServerFn({ method: "GET" }).handler(() =>
  studio((client) => client.organization()),
);

/** What an invitation's link offers. */
export const getInvitation = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ token: InvitationToken })))
  .handler(({ data }) => studio((client) => client.invitation(data)));
