import { Permission, type Scope } from "@repo/contracts/access";
import type { NamedScope } from "@repo/contracts/accounts";
import { BrandId, SiteId } from "@repo/contracts/ids";
import type { AccessPlace } from "@repo/contracts/studio";
import { type Access, authorize, mayGrant, mayOverride, type Resource } from "@repo/domain/access";
import { Effect, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";

import { organizationName } from "./organization.ts";
import { allRoles, refOf } from "./roles.ts";

/** A scope as people see it named, and as `authorize` reads it. */
export interface Place {
  readonly scope: NamedScope;
  readonly resource: Resource;
}

/** A key a scope is found by in `everyPlace`. */
export const placeKey = (scope: Scope) =>
  scope.kind === "organization" ? "organization" : `${scope.kind}:${scope.id}`;

/** The organization, its brands and its sites that aren't deleted, by `placeKey`. */
export const everyPlace = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const [organization, brands, sites] = yield* Effect.all(
    [
      organizationName,
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: Schema.Struct({ id: BrandId, name: Schema.String }),
        execute: () => sql`select id, name from brands order by name`,
      })(undefined),
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: Schema.Struct({ id: SiteId, name: Schema.String, brand_id: BrandId }),
        execute: () =>
          sql`select id, name, brand_id from sites where deleted_at is null order by name`,
      })(undefined),
    ],
    { concurrency: "unbounded" },
  );
  const places = new Map<string, Place>();
  if (Option.isSome(organization))
    places.set("organization", {
      scope: { kind: "organization", name: organization.value },
      resource: { kind: "organization" },
    });
  for (const brand of brands)
    places.set(placeKey({ kind: "brand", id: brand.id }), {
      scope: { kind: "brand", id: brand.id, name: brand.name },
      resource: { kind: "brand", id: brand.id },
    });
  for (const site of sites)
    places.set(placeKey({ kind: "site", id: site.id }), {
      scope: { kind: "site", id: site.id, name: site.name },
      resource: { kind: "site", id: site.id, brand: site.brand_id },
    });
  return places;
}).pipe(Effect.withSpan("StudioApi.everyPlace"));

/**
 * Every place a person controls, with the roles they may give there and the
 * permissions they may switch on or off for someone: only what they hold
 * there themselves.
 */
export const accessPlaces = Effect.fn("StudioApi.accessPlaces")(function* (access: Access) {
  const [places, roles] = yield* Effect.all([everyPlace, allRoles], {
    concurrency: "unbounded",
  });
  return Array.from(places.values()).flatMap(({ scope, resource }): Array<AccessPlace> =>
    authorize(access, "members.manage", resource)
      ? [
          {
            scope,
            roles: roles.filter((role) => mayGrant(access, role.permissions, resource)).map(refOf),
            permissions: Permission.literals.filter((permission) =>
              mayOverride(access, permission, resource),
            ),
          },
        ]
      : [],
  );
});
