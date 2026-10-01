import { Permission, RoleDescription, RoleName } from "@repo/contracts/access";
import { CustomRoleId } from "@repo/contracts/ids";
import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { studio } from "@/server/studio";

/** Every role, with who holds it where, and what the person may do with roles. */
export const getRoles = createServerFn({ method: "GET" }).handler(() =>
  studio((client) => client.roles()),
);

export const saveRole = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({
        role: Schema.NullOr(CustomRoleId),
        name: RoleName,
        description: RoleDescription,
        permissions: Schema.Array(Permission),
      }),
    ),
  )
  .handler(({ data }) => studio((client) => client.saveRole(data)));

export const deleteRole = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ role: CustomRoleId })))
  .handler(({ data }) => studio((client) => client.deleteRole(data)));
