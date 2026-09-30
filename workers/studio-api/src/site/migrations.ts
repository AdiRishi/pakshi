import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import * as Migrator from "effect/unstable/sql/Migrator";

/** The schema of a SiteDoc's own storage, applied when the object starts. */
export const migrations = Migrator.fromRecord({
  "0001_drafts": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`create table drafts (
      id text primary key,
      base_release text not null,
      base_snapshot text not null,
      revision integer not null,
      settings text not null,
      parts text not null,
      forms text not null,
      lockfile text not null,
      theme text not null
    )`;
    // Each draft page is its own row, because a row holds at most 2 MB and
    // a large draft saved as one value wouldn't fit.
    yield* sql`create table draft_pages (
      draft_id text not null references drafts (id),
      page_id text not null,
      document text not null,
      primary key (draft_id, page_id)
    )`;
    // Every committed batch, by the ID its sender made, so a batch sent twice
    // is recognised. It's also the draft's history: who changed what, and how
    // to undo it.
    yield* sql`create table batches (
      id text primary key,
      draft_id text not null references drafts (id),
      actor text not null,
      committed_at text not null,
      revision integer not null,
      ops text not null,
      inverse text not null
    )`;
  }),
  "0002_live_editing": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    // The name the actor had, so people who catch up later see who made a change.
    yield* sql`alter table batches add column actor_name text not null default ''`;
    yield* sql`create index batches_by_revision on batches (draft_id, revision)`;
    // Who last wrote each part of a draft, keyed as the document module keys parts.
    yield* sql`create table writes (
      draft_id text not null references drafts (id),
      key text not null,
      actor text not null,
      revision integer not null,
      primary key (draft_id, key)
    )`;
  }),
  "0003_publishing": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`alter table drafts add column name text not null default 'Draft'`;
    yield* sql`alter table drafts add column status text not null default 'open'`;
    yield* sql`alter table drafts add column created_by text not null default '{"id":"","name":""}'`;
    yield* sql`alter table drafts add column created_at text not null default '2026-09-30T00:00:00.000Z'`;
    yield* sql`alter table drafts add column closed_at text`;
    // Every release the site has served, oldest first. The last is live.
    yield* sql`create table releases (
      seq integer primary key autoincrement,
      id text not null unique,
      release text not null
    )`;
    // Rows D1 is still to receive, written in the same transaction as the
    // change they copy and delivered by the alarm.
    yield* sql`create table outbox (
      id integer primary key autoincrement,
      message text not null
    )`;
  }),
});
