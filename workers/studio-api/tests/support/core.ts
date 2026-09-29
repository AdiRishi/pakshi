import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";

/** A fresh core database with the real migrations applied, two brands of sites and people with grants. */
export const core = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const folder = join(import.meta.dirname, "../../migrations");
    const files = (yield* Effect.promise(() => readdir(folder))).toSorted();
    const migrations = yield* Effect.promise(() =>
      Promise.all(files.map((file) => readFile(join(folder, file), "utf8"))),
    );
    const statements = migrations
      .join("\n")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .split(";")
      .map((statement) => statement.trim())
      .filter((statement) => statement !== "");
    for (const statement of statements) yield* sql.unsafe(statement);
    yield* sql`insert into brands (id, name) values ('brand_a', 'City Libraries'), ('brand_b', 'City Parks')`;
    yield* sql`insert into sites (id, brand_id, name) values
      ('site_a1', 'brand_a', 'Northbank Libraries'),
      ('site_a2', 'brand_a', 'Library Events'),
      ('site_b1', 'brand_b', 'Trails')`;
    for (const id of ["user_org", "user_brand", "user_editor", "user_approver", "user_denied"])
      yield* sql`insert into "user" (id, name, email, emailVerified, createdAt, updatedAt)
        values (${id}, ${id}, ${`${id}@pakshi.test`}, 1, '2026-09-29', '2026-09-29')`;
    yield* sql`insert into grants (user_id, role, scope_kind, scope_id) values
      ('user_org', 'org-admin', 'organization', null),
      ('user_brand', 'brand-admin', 'brand', 'brand_a'),
      ('user_editor', 'editor', 'site', 'site_a2'),
      ('user_approver', 'approver', 'site', 'site_a1'),
      ('user_denied', 'brand-admin', 'brand', 'brand_a')`;
    yield* sql`insert into media (id, site_id, brand_id, content_type, width, height, alt, created_at) values
      ('med_reading', 'site_a1', null, 'image/jpeg', 1600, 1067, 'Children reading', '2026-09-02'),
      ('med_logo', null, 'brand_a', 'image/png', 400, 400, '', '2026-09-01'),
      ('med_trail', 'site_b1', null, 'image/jpeg', 1200, 800, 'A forest trail', '2026-09-03')`;
    yield* sql`insert into permission_overrides (user_id, permission, scope_kind, scope_id, allowed)
      values ('user_denied', 'page.edit', 'site', 'site_a1', 0)`;
  }),
).pipe(Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" })));
