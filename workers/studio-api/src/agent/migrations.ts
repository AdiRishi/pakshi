import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import * as Migrator from "effect/unstable/sql/Migrator";

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
});
