import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { SqliteClient } from "@effect/sql-sqlite-node";
import { expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";

import { describeViewer } from "../src/viewer.ts";

/** A fresh core database with the real migration applied and two brands of sites. */
const core = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const migration = yield* Effect.promise(() =>
      readFile(join(import.meta.dirname, "../migrations/0001_core.sql"), "utf8"),
    );
    const statements = migration
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
    yield* sql`insert into permission_overrides (user_id, permission, scope_kind, scope_id, allowed)
      values ('user_denied', 'page.edit', 'site', 'site_a1', 0)`;
  }),
).pipe(Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" })));

const viewerOf = (id: string) =>
  describeViewer({ id, name: id, email: `${id}@pakshi.test` }).pipe(Effect.provide(core));

const siteNames = (id: string) =>
  Effect.map(viewerOf(id), (viewer) => viewer.sites.map((site) => site.name));

it.effect("an org admin can edit every site, and holds the role on the organization", () =>
  Effect.gen(function* () {
    const viewer = yield* viewerOf("user_org");
    expect(viewer.roles).toEqual([{ role: "Org admin", scope: "Organization" }]);
    expect(viewer.sites.map((site) => site.name)).toEqual([
      "Library Events",
      "Northbank Libraries",
      "Trails",
    ]);
  }),
);

it.effect("a brand admin can edit every site in their brand and none outside it", () =>
  Effect.gen(function* () {
    expect(yield* siteNames("user_brand")).toEqual(["Library Events", "Northbank Libraries"]);
  }),
);

it.effect("an editor on one site can edit only that site", () =>
  Effect.gen(function* () {
    const viewer = yield* viewerOf("user_editor");
    expect(viewer.roles).toEqual([{ role: "Editor", scope: "Library Events" }]);
    expect(viewer.sites.map((site) => site.brand)).toEqual(["City Libraries"]);
  }),
);

it.effect("an approver holds a role but edits no pages", () =>
  Effect.gen(function* () {
    const viewer = yield* viewerOf("user_approver");
    expect(viewer.roles).toEqual([{ role: "Approver", scope: "Northbank Libraries" }]);
    expect(viewer.sites).toEqual([]);
  }),
);

it.effect("a denial on one site hides it even though the brand's role would allow it", () =>
  Effect.gen(function* () {
    expect(yield* siteNames("user_denied")).toEqual(["Library Events"]);
  }),
);

it.effect("someone with no access sees nothing", () =>
  Effect.gen(function* () {
    const viewer = yield* viewerOf("user_nobody");
    expect(viewer.roles).toEqual([]);
    expect(viewer.sites).toEqual([]);
  }),
);
