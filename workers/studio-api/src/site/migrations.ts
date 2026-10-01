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
  "0004_approvals": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    // Whether a person or SiteDoc made each batch. Only people's batches
    // count as editing a draft.
    yield* sql`alter table batches add column origin text not null default 'person'`;
    yield* sql`alter table drafts add column sharing text not null
      default '{"people":[],"general":{"audience":"people","access":"view"}}'`;
    // Drafts submitted for approval. Each keeps the draft revision it froze,
    // and the snapshot it froze to, which a draft edited after submitting
    // is merged against when the submission publishes.
    yield* sql`create table submissions (
      id text primary key,
      draft_id text not null references drafts (id),
      revision integer not null,
      frozen_snapshot text not null,
      submission text not null
    )`;
    yield* sql`create index submissions_by_draft on submissions (draft_id)`;
  }),
  "0005_agent": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    // The agent's turn a batch belongs to, so a turn can be undone as one step.
    yield* sql`alter table batches add column turn text`;
    yield* sql`create index batches_by_turn on batches (draft_id, turn)`;
  }),
  "0006_brands": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    // A draft pins a brand revision, with its theme and identity, instead of a theme alone.
    yield* sql`alter table drafts rename column theme to brand`;
    yield* sql`alter table drafts add column kind text not null default '{"_tag":"Edit"}'`;
    // Each brand revision the site has taken in, whether a Brand update draft
    // brought it or the site already had it. The newest is the one D1's copy
    // records, so the scheduled job knows which sites still need a revision.
    yield* sql`create table brand_revisions (
      number integer primary key,
      taken_at text not null
    )`;
  }),
  "0007_settings": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    // Each setting someone has saved, with the settings revision that saved it.
    yield* sql`create table settings (
      key text primary key,
      value text not null,
      revision integer not null,
      saved_by text,
      saved_at text not null
    )`;
    yield* sql`alter table drafts drop column settings`;
  }),
  "0008_redirects": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`alter table drafts add column redirects text not null default '{}'`;
  }),
  "0009_permissions": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    // What studio-api last found each person may do on the site, for
    // everyone who has opened a live connection or a conversation with the
    // agent here. Their batches are checked against it.
    yield* sql`create table permissions (
      person text primary key,
      permissions text not null
    )`;
  }),
  "0010_editing_sessions": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    // Each person's latest run of edits in each draft, which the audit log
    // records as one editing session.
    yield* sql`create table editing_sessions (
      draft_id text not null,
      person text not null,
      id text not null,
      started_at text not null,
      last_at text not null,
      batches integer not null,
      reported_at text not null,
      primary key (draft_id, person)
    )`;
  }),
});
