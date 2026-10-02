import { expect, it } from "@effect/vitest";
import { latestLockfile } from "@repo/blocks";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

import { removableVersions } from "../src/blocks.ts";
import { core } from "./support/core.ts";

/** Every site serving the newest blocks, except hero at `hero`. */
const allLive = (hero: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const lockfile = JSON.stringify({ ...latestLockfile, hero });
    for (const site of ["site_a1", "site_a2", "site_b1"])
      yield* sql`insert into block_usage (site_id, holder, lockfile) values (${site}, 'live', ${lockfile})
        on conflict (site_id, holder) do update set lockfile = excluded.lockfile`;
  });

const removable = Effect.map(removableVersions(), (versions) =>
  versions.filter((version) => version.type === "hero" || version.type === "header"),
);

it.effect("a version an older live version upgrades through stays, even unused", () =>
  Effect.gen(function* () {
    yield* allLive(1);
    // hero v2 and v3 are how v1 content reaches v4; header v1 and v2 are no one's.
    expect(yield* removable).toEqual([
      { type: "header", version: 1, lastUsedAt: null },
      { type: "header", version: 2, lastUsedAt: null },
    ]);
  }).pipe(Effect.provide(core)),
);

it.effect("a version stays for 3 months after the last site stops using it", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* allLive(3);
    yield* sql`insert into block_versions (type, version, last_used_at) values
      ('hero', 1, '2026-01-01T00:00:00.000Z'), ('hero', 2, ${new Date().toISOString()})`;
    expect((yield* removable).map(({ type, version }) => `${type}@${version}`)).toEqual([
      "header@1",
      "header@2",
      "hero@1",
    ]);
  }).pipe(Effect.provide(core)),
);

it.effect("no version is listed while a site hasn't reported the versions it serves", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* allLive(3);
    yield* sql`delete from block_usage where site_id = 'site_b1'`;
    expect(yield* removableVersions()).toEqual([]);
  }).pipe(Effect.provide(core)),
);
