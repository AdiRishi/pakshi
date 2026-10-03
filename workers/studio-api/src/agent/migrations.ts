import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import * as Migrator from "effect/sql/Migrator";

/** The schema of a SiteAgent's own storage: one person's conversation in one draft. */
export const migrations = Migrator.fromRecord({
  "0001_conversation": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    // The model's view of the conversation, as Effect AI exports it, and the
    // plan the person built, which is the agent's brief. One row.
    yield* sql`create table conversation (
      id integer primary key check (id = 1),
      prompt text,
      brief text
    )`;
    // The conversation as the chat panel shows it, one turn per row.
    yield* sql`create table turns (
      seq integer primary key autoincrement,
      id text not null unique,
      turn text not null
    )`;
    // Documents attached to the conversation. The files and their Markdown are in R2.
    yield* sql`create table sources (
      seq integer primary key autoincrement,
      id text not null unique,
      name text not null,
      size integer not null,
      object text not null
    )`;
  }),
  "0002_thread": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    // The conversation becomes one TanStack AI thread, a message per row in
    // order, which both the model and the chat panel read. The model's
    // history in Effect AI's format and the chat's turns go, conversations
    // and all.
    yield* sql`drop table turns`;
    yield* sql`alter table conversation drop column prompt`;
    yield* sql`create table messages (
      seq integer primary key,
      message text not null
    )`;
  }),
});
