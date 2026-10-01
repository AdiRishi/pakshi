import type { Permission, Scope } from "@repo/contracts/access";
import { BrandId, SiteId } from "@repo/contracts/ids";
import { covers, permissionsOn } from "@repo/domain/access";
import { type Cause, Context, Effect, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

import { loadAccess } from "./access.ts";

/**
 * The SiteDocs that check people's batches against their permissions. Each
 * keeps what studio-api last told it, so a change of access must reach every
 * site it covers before the person's next batch. A change that can't reach
 * one fails, and making the change again tells the sites again.
 */
export class LiveAccess extends Context.Service<
  LiveAccess,
  {
    readonly refresh: (
      site: SiteId,
      people: ReadonlyArray<{
        readonly id: string;
        readonly permissions: ReadonlyArray<Permission>;
      }>,
    ) => Effect.Effect<void, Cause.UnknownError>;
  }
>()("Pakshi/StudioApi/LiveAccess") {}

const SiteRow = Schema.Struct({ id: SiteId, brand_id: BrandId });

/**
 * Tells every site a change of access reaches what each person it changed
 * may do there now, which can be nothing.
 */
export const refreshAccess = Effect.fn("StudioApi.refreshAccess")(function* (
  changes: ReadonlyArray<{ readonly person: string; readonly scope: Scope }>,
) {
  if (changes.length === 0) return;
  const sql = yield* SqlClient.SqlClient;
  const live = yield* LiveAccess;
  const sites = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: SiteRow,
    execute: () => sql`select id, brand_id from sites where deleted_at is null`,
  })(undefined);
  const people = Array.from(new Set(changes.map((change) => change.person)));
  const accesses = new Map(
    yield* Effect.forEach(
      people,
      (person) => Effect.map(loadAccess(person), ({ access }) => [person, access] as const),
      { concurrency: "unbounded" },
    ),
  );
  yield* Effect.forEach(
    sites,
    (site) => {
      const resource = { kind: "site", id: site.id, brand: site.brand_id } as const;
      const reached = people.flatMap((person) => {
        const access = accesses.get(person);
        return access !== undefined &&
          changes.some((change) => change.person === person && covers(change.scope, resource))
          ? [{ id: person, permissions: permissionsOn(access, resource) }]
          : [];
      });
      return reached.length === 0 ? Effect.void : live.refresh(site.id, reached);
    },
    { concurrency: 10, discard: true },
  );
});
