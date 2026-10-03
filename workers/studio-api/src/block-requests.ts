import { BlockRequestId, BlockType, randomId, SiteId } from "@repo/contracts/ids";
import { now, Timestamp } from "@repo/contracts/release";
import {
  type BlockRequest,
  type BlockRequests,
  NotPermitted,
  type Person,
} from "@repo/contracts/studio";
import { authorize } from "@repo/domain/access";
import { Effect, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";

import { loadAccess } from "./access.ts";
import { audit } from "./audit.ts";
import { everyPlace } from "./places.ts";

/*
 * Requests for blocks the library doesn't have, kept in Pakshi for the
 * platform team. People file them from the block catalog, or the agent files
 * one for its person, for a site they may ask for blocks on. The platform
 * team, who may upgrade blocks across the organization, reads them all and
 * closes each once it has answered.
 */

const RequestRow = Schema.Struct({
  id: BlockRequestId,
  site_id: Schema.NullOr(SiteId),
  site_name: Schema.NullOr(Schema.String),
  requested_by: Schema.String,
  requester_name: Schema.String,
  need: Schema.String,
  example: Schema.String,
  nearest: Schema.NullOr(BlockType),
  created_at: Timestamp,
  closed_at: Schema.NullOr(Timestamp),
});

const requestOf = (row: typeof RequestRow.Type): BlockRequest => ({
  id: row.id,
  site: row.site_id === null ? null : { id: row.site_id, name: row.site_name ?? "" },
  requestedBy: { id: row.requested_by, name: row.requester_name },
  need: row.need,
  example: row.example,
  nearest: row.nearest,
  requestedAt: row.created_at,
  closedAt: row.closed_at,
});

/** Whether a person is on the platform team, who ship blocks to every site. */
const platform = Effect.fn("StudioApi.blocksPlatform")(function* (person: Person) {
  const { access } = yield* loadAccess(person.id);
  return authorize(access, "blocks.upgrade", { kind: "organization" });
});

/** The sites a person may ask for blocks on. */
const requestable = Effect.fn("StudioApi.requestableSites")(function* (person: Person) {
  const [{ access }, places] = yield* Effect.all([loadAccess(person.id), everyPlace], {
    concurrency: "unbounded",
  });
  return Array.from(places.values()).flatMap(({ scope, resource }) =>
    resource.kind === "site" &&
    scope.kind === "site" &&
    authorize(access, "blocks.request", resource)
      ? [{ id: scope.id, name: scope.name }]
      : [],
  );
});

const select = (sql: SqlClient.SqlClient) => sql`
  select r.id, r.site_id, s.name as site_name, r.requested_by, u.name as requester_name,
    r.need, r.example, r.nearest, r.created_at, r.closed_at
  from block_requests r
  join "user" u on u.id = r.requested_by
  left join sites s on s.id = r.site_id`;

/** The block requests a person may see, open ones first, newest first within each. */
export const blockRequests = Effect.fn("StudioApi.blockRequests")(function* (person: Person) {
  const sql = yield* SqlClient.SqlClient;
  const [everyone, sites] = yield* Effect.all([platform(person), requestable(person)], {
    concurrency: "unbounded",
  });
  const rows = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: RequestRow,
    execute: () => sql`${select(sql)}
      where ${everyone ? sql`1 = 1` : sql`r.requested_by = ${person.id}`}
      order by r.closed_at is not null, r.created_at desc`,
  })(undefined);
  return { requests: rows.map(requestOf), sites, can: { close: everyone } } satisfies BlockRequests;
});

/**
 * Files a request for a block, for one site the person may ask for blocks on,
 * or with null, for any site, which needs them to be able to ask on one.
 */
export const requestBlock = Effect.fn("StudioApi.requestBlock")(function* (
  person: Person,
  request: {
    readonly site: SiteId | null;
    readonly need: string;
    readonly example: string;
    readonly nearest: BlockType | null;
  },
) {
  const sql = yield* SqlClient.SqlClient;
  const sites = yield* requestable(person);
  const allowed =
    request.site === null ? sites.length > 0 : sites.some((site) => site.id === request.site);
  if (!allowed) return yield* new NotPermitted({ action: "ask for blocks here" });
  const id = BlockRequestId.make(randomId("breq"));
  yield* sql`insert into block_requests (id, site_id, requested_by, need, example, nearest, created_at)
    values (${id}, ${request.site}, ${person.id}, ${request.need}, ${request.example},
      ${request.nearest}, ${now()})`;
  yield* audit(person, request.site === null ? {} : { site: request.site }, {
    _tag: "BlockRequested",
    need: request.need,
  });
  // The row was written just now.
  const row = yield* SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: RequestRow,
    execute: () => sql`${select(sql)} where r.id = ${id}`,
  })(undefined).pipe(Effect.flatMap(Effect.fromOption), Effect.orDie);
  return requestOf(row);
});

/** Closes a block request the platform team has answered. Closing one twice changes nothing. */
export const closeBlockRequest = Effect.fn("StudioApi.closeBlockRequest")(function* (
  person: Person,
  id: BlockRequestId,
) {
  const sql = yield* SqlClient.SqlClient;
  if (!(yield* platform(person)))
    return yield* new NotPermitted({ action: "close block requests" });
  yield* sql`update block_requests set closed_at = ${now()}, closed_by = ${person.id}
    where id = ${id} and closed_at is null`;
});
