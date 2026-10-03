import {
  type AuditCursor,
  AuditEntry,
  AuditEvent,
  type AuditFilters,
  AuditId,
  auditKinds,
  type AuditPage,
  type AuditQuery,
  type AuditRow,
} from "@repo/contracts/audit";
import { BrandId, randomId, SiteId } from "@repo/contracts/ids";
import type { Collaborator } from "@repo/contracts/live";
import { now, Timestamp } from "@repo/contracts/release";
import { NotPermitted, type Person } from "@repo/contracts/studio";
import { authorize } from "@repo/domain/access";
import { auditEventTitles, describeAuditEvent } from "@repo/domain/audit";
import { csv } from "@repo/domain/csv";
import { Effect, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";

import { loadAccess } from "./access.ts";
import { everyPlace } from "./places.ts";

const encodeEvent = Schema.encodeEffect(Schema.fromJsonString(AuditEvent));

/**
 * Writes an entry to the audit log. Writing an entry with an ID the log has
 * replaces it, which only entries still growing, such as an editing
 * session, do. A site's entry is filed under its brand too, so the log can
 * be read by brand after the site is gone.
 */
export const writeAudit = Effect.fn("StudioApi.writeAudit")(function* (entry: AuditEntry) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`insert into audit_log (id, at, actor_id, actor_name, site_id, brand_id, event, kind)
    values (${entry.id}, ${entry.at}, ${entry.actor?.id ?? null}, ${entry.actor?.name ?? null},
      ${entry.site},
      coalesce(${entry.brand}, (select brand_id from sites where id = ${entry.site})),
      ${yield* encodeEvent(entry.event)}, ${entry.event._tag})
    on conflict (id) do update set at = excluded.at, event = excluded.event`;
});

/** A new entry for something that happened just now. */
export const auditEntry = (
  actor: Collaborator | null,
  place: { readonly site?: SiteId; readonly brand?: BrandId },
  event: AuditEvent,
): AuditEntry => ({
  id: AuditId.make(randomId("aud")),
  at: now(),
  actor: actor === null ? null : { id: actor.id, name: actor.name },
  site: place.site ?? null,
  brand: place.brand ?? null,
  event,
});

/** Records that someone did something just now. */
export const audit = (
  actor: Collaborator | null,
  place: { readonly site?: SiteId; readonly brand?: BrandId },
  event: AuditEvent,
) => writeAudit(auditEntry(actor, place, event));

const pageSize = 50;

/** The most an export holds, newest first. */
const exportLimit = 10_000;

const AuditRowSql = Schema.Struct({
  id: AuditId,
  at: Timestamp,
  actor_id: Schema.NullOr(Schema.String),
  actor_name: Schema.NullOr(Schema.String),
  site_id: Schema.NullOr(SiteId),
  brand_id: Schema.NullOr(BrandId),
  event: Schema.fromJsonString(AuditEvent),
  site_name: Schema.NullOr(Schema.String),
  brand_name: Schema.NullOr(Schema.String),
});

/**
 * What a person may read of the audit log: everything, with `audit.read`
 * across the organization, or else the entries of the sites and brands they
 * may read it on. Null when they may read none of it.
 */
const readable = Effect.fn("StudioApi.readableAudit")(function* (person: Person) {
  const { access } = yield* loadAccess(person.id);
  if (authorize(access, "audit.read", { kind: "organization" }))
    return { everything: true } as const;
  const places = Array.from((yield* everyPlace).values()).filter(({ resource }) =>
    authorize(access, "audit.read", resource),
  );
  if (places.length === 0) return null;
  return {
    everything: false,
    sites: places.flatMap(({ resource }) => (resource.kind === "site" ? [resource.id] : [])),
    brands: places.flatMap(({ resource }) => (resource.kind === "brand" ? [resource.id] : [])),
  } as const;
});

/** The SQL condition an audit query and a person's reach make, over `audit_log a`. */
const conditions = (
  sql: SqlClient.SqlClient,
  query: AuditQuery,
  reach: NonNullable<Effect.Success<ReturnType<typeof readable>>>,
  before: AuditCursor | null,
) => {
  const kinds = query.kinds.flatMap((kind) => auditKinds[kind].events);
  return sql.and([
    ...(reach.everything
      ? []
      : [
          sql`((a.site_id is not null and a.site_id in (select value from json_each(${JSON.stringify(reach.sites)})))
            or (a.site_id is null and a.brand_id in (select value from json_each(${JSON.stringify(reach.brands)}))))`,
        ]),
    ...(query.person === null ? [] : [sql`a.actor_id = ${query.person}`]),
    ...(query.site === null ? [] : [sql`a.site_id = ${query.site}`]),
    ...(kinds.length === 0
      ? []
      : [sql`a.kind in (select value from json_each(${JSON.stringify(kinds)}))`]),
    ...(query.since === null ? [] : [sql`a.at >= ${query.since}`]),
    ...(query.until === null ? [] : [sql`a.at < ${query.until}`]),
    ...(before === null
      ? []
      : [sql`(a.at < ${before.at} or (a.at = ${before.at} and a.id < ${before.id}))`]),
  ]);
};

const rowsOf = Effect.fn("StudioApi.auditRows")(function* (
  query: AuditQuery,
  reach: NonNullable<Effect.Success<ReturnType<typeof readable>>>,
  before: AuditCursor | null,
  limit: number,
) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: AuditRowSql,
    execute: () => sql`select a.id, a.at, a.actor_id, a.actor_name, a.site_id, a.brand_id, a.event,
        s.name as site_name, b.name as brand_name
      from audit_log a
      left join sites s on s.id = a.site_id
      left join brands b on b.id = a.brand_id
      where ${conditions(sql, query, reach, before)}
      order by a.at desc, a.id desc limit ${limit}`,
  })(undefined);
  return rows.map((row): AuditRow => ({
    entry: {
      id: row.id,
      at: row.at,
      actor: row.actor_id === null ? null : { id: row.actor_id, name: row.actor_name ?? "" },
      site: row.site_id,
      brand: row.brand_id,
      event: row.event,
    },
    site: row.site_name,
    brand: row.brand_name,
  }));
});

/** A page of the entries a query matches that the person may read, newest first. */
export const auditLog = Effect.fn("StudioApi.auditLog")(function* (
  person: Person,
  query: AuditQuery,
  before: AuditCursor | null,
) {
  const sql = yield* SqlClient.SqlClient;
  const reach = yield* readable(person);
  if (reach === null) return yield* new NotPermitted({ action: "read the audit log" });
  const [rows, [count]] = yield* Effect.all(
    [
      rowsOf(query, reach, before, pageSize),
      sql<{ readonly total: number }>`select count(*) as total from audit_log a
        where ${conditions(sql, query, reach, null)}`,
    ],
    { concurrency: "unbounded" },
  );
  const last = rows.at(-1);
  return {
    rows,
    total: count?.total ?? 0,
    next:
      rows.length === pageSize && last !== undefined
        ? { at: last.entry.at, id: last.entry.id }
        : null,
  } satisfies AuditPage;
});

/** The people who did something and the sites things happened on, to filter the log by. */
export const auditFilters = Effect.fn("StudioApi.auditFilters")(function* (person: Person) {
  const sql = yield* SqlClient.SqlClient;
  if ((yield* readable(person)) === null)
    return yield* new NotPermitted({ action: "read the audit log" });
  const [people, sites] = yield* Effect.all(
    [
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: Schema.Struct({ id: Schema.String, name: Schema.String }),
        execute: () => sql`select id, name from "user" order by name`,
      })(undefined),
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: Schema.Struct({ id: SiteId, name: Schema.String }),
        execute: () => sql`select id, name from sites where deleted_at is null order by name`,
      })(undefined),
    ],
    { concurrency: "unbounded" },
  );
  return { people, sites } satisfies AuditFilters;
});

/** Every entry a query matches that the person may read, as CSV, newest first. */
export const exportAudit = Effect.fn("StudioApi.exportAudit")(function* (
  person: Person,
  query: AuditQuery,
) {
  const reach = yield* readable(person);
  if (reach === null) return yield* new NotPermitted({ action: "export the audit log" });
  const rows = yield* rowsOf(query, reach, null, exportLimit);
  return {
    filename: `audit-log-${now().slice(0, 10)}.csv`,
    csv: csv([
      ["Time", "Person", "Event", "Site", "Brand", "Details"],
      ...rows.map((row) => [
        row.entry.at,
        row.entry.actor?.name ?? "Pakshi",
        auditEventTitles[row.entry.event._tag],
        row.site ?? "",
        row.brand ?? "",
        describeAuditEvent(row.entry.event),
      ]),
    ]),
  };
});
