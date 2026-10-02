import { FormEntry, type NewEntry } from "@repo/contracts/entries";
import { EntryId, FormId, randomId, type SiteId } from "@repo/contracts/ids";
import { now, Timestamp } from "@repo/contracts/release";
import { LiveSettings } from "@repo/contracts/settings";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { type SqlError, SqlClient, SqlSchema } from "effect/unstable/sql";
import * as Migrator from "effect/unstable/sql/Migrator";

/*
 * A site's form entries in its SiteSubmissions' SQLite storage, with the
 * new entry emails still to send. Each email waits in `notifications` until
 * it's sent, and a failed one is tried again later.
 */

export type StorageError = SqlError.SqlError | Schema.SchemaError;

export const migrations = Migrator.fromRecord({
  "0001_entries": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    // The settings that take effect at once, as the site's SiteDoc last sent
    // them, with the Studio address its links go to.
    yield* sql`create table config (
      id integer primary key check (id = 1),
      settings text not null,
      studio text not null
    )`;
    yield* sql`create table entries (
      id text primary key,
      form_id text not null,
      form_name text not null,
      page text not null,
      email text,
      fields text not null,
      received_at text not null
    )`;
    yield* sql`create index entries_by_form on entries (form_id, received_at, id)`;
    // Everything for one person is found by the address they gave.
    yield* sql`create index entries_by_email on entries (email)`;
    yield* sql`create table notifications (
      entry_id text primary key,
      site_id text not null,
      site_name text not null,
      recipients text not null,
      studio text not null,
      attempts integer not null default 0,
      due_at text not null
    )`;
  }),
});

const json = Schema.fromJsonString;

const EntryRow = Schema.Struct({
  id: EntryId,
  form_id: FormId,
  form_name: Schema.String,
  page: FormEntry.fields.page,
  email: FormEntry.fields.email,
  fields: json(FormEntry.fields.fields),
  received_at: Timestamp,
});

const entryOf = (row: typeof EntryRow.Type): FormEntry => ({
  id: row.id,
  form: row.form_id,
  formName: row.form_name,
  page: row.page,
  email: row.email,
  fields: row.fields,
  receivedAt: row.received_at,
});

const ConfigRow = Schema.Struct({ settings: json(LiveSettings), studio: Schema.String });

const NotificationRow = Schema.Struct({
  entry_id: EntryId,
  site_id: Schema.String,
  site_name: Schema.String,
  recipients: json(Schema.Array(Schema.String)),
  studio: Schema.String,
  attempts: Schema.Int,
  form_name: Schema.String,
  page: Schema.String,
});

const encodeSettings = Schema.encodeSync(json(LiveSettings));
const encodeFields = Schema.encodeSync(json(FormEntry.fields.fields));
const encodeRecipients = Schema.encodeSync(json(Schema.Array(Schema.String)));

/** One new entry email. Each links to the entry in Studio rather than repeating what it says. */
export interface EntryEmail {
  readonly to: ReadonlyArray<string>;
  readonly subject: string;
  readonly text: string;
}

/** How long a failed email waits before it's tried again: doubling from a minute, up to six hours. */
const retryDelay = (attempts: number) => Math.min(2 ** attempts, 360) * 60_000;

/** The page of a form's entries before an entry, newest first, with `search` in an answer when given. */
export interface EntriesBefore {
  readonly form: FormId;
  readonly search: string | null;
  readonly before: { readonly receivedAt: Timestamp; readonly id: EntryId } | null;
  readonly limit: number;
}

export class SiteEntries extends Context.Service<
  SiteEntries,
  {
    /** Takes the settings that take effect at once, and the Studio address emails link to. */
    readonly configure: (
      settings: LiveSettings,
      studio: string,
    ) => Effect.Effect<void, StorageError>;
    /** Stores an entry, and queues its email when the settings send the form's entries somewhere. */
    readonly receive: (
      site: { readonly id: SiteId; readonly name: string },
      entry: NewEntry,
    ) => Effect.Effect<{ readonly entry: FormEntry; readonly notify: boolean }, StorageError>;
    /** Every form that has entries, with how many and when the latest came. */
    readonly forms: Effect.Effect<
      ReadonlyArray<{
        readonly id: FormId;
        readonly name: string;
        readonly entries: number;
        readonly latest: Timestamp;
      }>,
      StorageError
    >;
    readonly entries: (
      page: EntriesBefore,
    ) => Effect.Effect<ReadonlyArray<FormEntry>, StorageError>;
    /** How many entries came at or after a moment, on every form. */
    readonly receivedSince: (since: Timestamp) => Effect.Effect<number, StorageError>;
    /** All of a form's entries, oldest first, for an export. */
    readonly everyEntry: (form: FormId) => Effect.Effect<ReadonlyArray<FormEntry>, StorageError>;
    readonly entry: (id: EntryId) => Effect.Effect<Option.Option<FormEntry>, StorageError>;
    /** Deletes one entry, and whether there was one. */
    readonly remove: (id: EntryId) => Effect.Effect<boolean, StorageError>;
    /** How many entries gave this address, on each form. */
    readonly countFor: (email: string) => Effect.Effect<
      ReadonlyArray<{
        readonly form: FormId;
        readonly name: string;
        readonly entries: number;
        readonly first: Timestamp;
        readonly latest: Timestamp;
      }>,
      StorageError
    >;
    /** Deletes every entry that gave this address, and how many there were. */
    readonly removeFor: (email: string) => Effect.Effect<number, StorageError>;
    /**
     * Sends every email that's due, and returns when the next one is due, or
     * null when none is waiting.
     */
    readonly sendDue: (
      send: (email: EntryEmail) => Promise<void>,
    ) => Effect.Effect<number | null, StorageError>;
  }
>()("Pakshi/SitesApi/SiteEntries") {
  static readonly layer = Layer.effect(
    SiteEntries,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const config = SqlSchema.findOneOption({
        Request: Schema.Void,
        Result: ConfigRow,
        execute: () => sql`select settings, studio from config where id = 1`,
      })(undefined);
      const rows = (query: Effect.Effect<ReadonlyArray<unknown>, SqlError.SqlError>) =>
        Effect.map(
          SqlSchema.findAll({ Request: Schema.Void, Result: EntryRow, execute: () => query })(
            undefined,
          ),
          (found) => found.map(entryOf),
        );
      const nextDue = Effect.map(
        sql<{ readonly due: string | null }>`select min(due_at) as due from notifications`,
        ([row]) => (row?.due === null || row?.due === undefined ? null : Date.parse(row.due)),
      );

      return SiteEntries.of({
        configure: (settings, studio) =>
          Effect.asVoid(
            sql`insert into config (id, settings, studio) values (1, ${encodeSettings(settings)}, ${studio})
              on conflict (id) do update set settings = excluded.settings, studio = excluded.studio`,
          ),
        receive: Effect.fn("SiteEntries.receive")(function* (site, entry) {
          const saved: FormEntry = {
            ...entry,
            id: EntryId.make(randomId("ent")),
            receivedAt: now(),
          };
          const current = yield* config;
          const recipients = Option.match(current, {
            onNone: () => [],
            onSome: ({ settings }) => settings.formEmails[entry.form] ?? [],
          });
          yield* sql.withTransaction(
            Effect.gen(function* () {
              yield* sql`insert into entries (id, form_id, form_name, page, email, fields, received_at)
                values (${saved.id}, ${saved.form}, ${saved.formName}, ${saved.page},
                  ${saved.email}, ${encodeFields(saved.fields)}, ${saved.receivedAt})`;
              if (Option.isSome(current) && recipients.length > 0)
                yield* sql`insert into notifications
                  (entry_id, site_id, site_name, recipients, studio, due_at)
                  values (${saved.id}, ${site.id}, ${site.name}, ${encodeRecipients(recipients)},
                    ${current.value.studio}, ${saved.receivedAt})`;
            }),
          );
          return { entry: saved, notify: recipients.length > 0 };
        }),
        forms: SqlSchema.findAll({
          Request: Schema.Void,
          Result: Schema.Struct({
            id: FormId,
            name: Schema.String,
            entries: Schema.Int,
            latest: Timestamp,
          }),
          // The name the form had when its latest entry came.
          execute: () => sql`select form_id as id, form_name as name, count(*) as entries,
                max(received_at) as latest
              from entries group by form_id order by latest desc`,
        })(undefined),
        entries: ({ form, search, before, limit }) =>
          rows(sql`select * from entries where form_id = ${form}
            and ${
              before === null
                ? sql`1 = 1`
                : sql`(received_at, id) < (${before.receivedAt}, ${before.id})`
            }
            and ${
              search === null
                ? sql`1 = 1`
                : sql`exists (select 1 from json_each(entries.fields)
                    where json_each.value ->> 'value' like ${`%${search}%`})`
            }
            order by received_at desc, id desc limit ${limit}`),
        receivedSince: (since) =>
          Effect.map(
            sql<{ readonly entries: number }>`select count(*) as entries from entries
              where received_at >= ${since}`,
            ([row]) => row?.entries ?? 0,
          ),
        countFor: (email) =>
          SqlSchema.findAll({
            Request: Schema.Void,
            Result: Schema.Struct({
              form: FormId,
              name: Schema.String,
              entries: Schema.Int,
              first: Timestamp,
              latest: Timestamp,
            }),
            execute: () => sql`select form_id as form, form_name as name, count(*) as entries,
                min(received_at) as first, max(received_at) as latest
              from entries where email = ${email.toLowerCase()}
              group by form_id order by latest desc`,
          })(undefined),
        everyEntry: (form) =>
          rows(sql`select * from entries where form_id = ${form} order by received_at, id`),
        entry: (id) =>
          Effect.map(rows(sql`select * from entries where id = ${id}`), (found) =>
            Option.fromNullishOr(found[0]),
          ),
        remove: (id) =>
          sql.withTransaction(
            Effect.gen(function* () {
              yield* sql`delete from notifications where entry_id = ${id}`;
              const removed = yield* sql`delete from entries where id = ${id} returning id`;
              return removed.length > 0;
            }),
          ),
        removeFor: (email) =>
          sql.withTransaction(
            Effect.gen(function* () {
              const address = email.toLowerCase();
              yield* sql`delete from notifications
                where entry_id in (select id from entries where email = ${address})`;
              const removed = yield* sql`delete from entries where email = ${address} returning id`;
              return removed.length;
            }),
          ),
        sendDue: Effect.fn("SiteEntries.sendDue")(function* (send) {
          const due = yield* SqlSchema.findAll({
            Request: Schema.Void,
            Result: NotificationRow,
            execute: () => sql`select notifications.*, entries.form_name, entries.page
              from notifications join entries on entries.id = notifications.entry_id
              where due_at <= ${now()} order by due_at`,
          })(undefined);
          for (const notification of due) {
            const link = `${notification.studio}/sites/${notification.site_id}/submissions/${notification.entry_id}`;
            const sent = yield* Effect.tryPromise(() =>
              send({
                to: notification.recipients,
                subject: `New entry: ${notification.form_name}, ${notification.site_name}`,
                text: [
                  `Someone sent the ${notification.form_name} form on ${notification.site_name}, from ${notification.page}.`,
                  `Read it in Pakshi: ${link}`,
                  "Their answers aren't in this email, so personal details stay out of inboxes.",
                ].join("\n\n"),
              }),
            ).pipe(
              Effect.as(true),
              Effect.orElseSucceed(() => false),
            );
            if (sent)
              yield* sql`delete from notifications where entry_id = ${notification.entry_id}`;
            else
              yield* sql`update notifications set attempts = attempts + 1,
                due_at = ${new Date(Date.now() + retryDelay(notification.attempts)).toISOString()}
                where entry_id = ${notification.entry_id}`;
          }
          return yield* nextDue;
        }),
      });
    }),
  );
}
