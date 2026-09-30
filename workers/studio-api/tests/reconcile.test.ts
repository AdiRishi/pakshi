import { expect, it } from "@effect/vitest";
import { ReleaseId, SiteId, SnapshotId } from "@repo/contracts/ids";
import { Release, Timestamp } from "@repo/contracts/release";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

import { reconcileSites } from "../src/reconcile.ts";
import { recordRelease } from "../src/site/release-index.ts";
import { core } from "./support/core.ts";

/** KV as `sites` reads it: the release value each site holds. */
const served = (entries: Readonly<Record<string, string>>) => (site: SiteId) =>
  Promise.resolve(entries[site] ?? null);

it.effect(
  "asks the SiteDoc of each site whose KV entry isn't its live release to write it again",
  () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`insert into releases (id, site_id, seq, snapshot, release, published_at) values
      ('rel_a1first', 'site_a1', 1, 'snap_a1first', '{}', '2026-09-01T00:00:00.000Z'),
      ('rel_a1second', 'site_a1', 2, 'snap_a1second', '{}', '2026-09-02T00:00:00.000Z'),
      ('rel_a2first', 'site_a2', 1, 'snap_a2first', '{}', '2026-09-01T00:00:00.000Z'),
      ('rel_b1first', 'site_b1', 1, 'snap_b1first', '{}', '2026-09-01T00:00:00.000Z')`;
      const asked: Array<SiteId> = [];
      yield* reconcileSites(
        served({
          // Changed by hand back to the first release.
          site_a1: '{"release":"rel_a1first","snapshot":"snap_a1first"}',
          site_a2: '{"release":"rel_a2first","snapshot":"snap_a2first"}',
          // site_b1's entry is missing.
        }),
        (site) => Effect.sync(() => void asked.push(site)),
      );
      expect(asked.toSorted()).toEqual(["site_a1", "site_b1"]);
    }).pipe(Effect.provide(core)),
);

it.effect("recording a release again puts right a copy in D1 that drifted", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const site = SiteId.make("site_a1");
    const release = Release.cases.Imported.make({
      id: ReleaseId.make("rel_a1first"),
      snapshot: SnapshotId.make("snap_a1first"),
      at: Timestamp.make("2026-09-01T00:00:00.000Z"),
    });
    yield* recordRelease(site, { seq: 1, release });
    yield* sql`update releases set snapshot = 'snap_changedbyhand' where id = 'rel_a1first'`;
    const asked: Array<SiteId> = [];
    const served = () => Promise.resolve('{"release":"rel_a1first","snapshot":"snap_a1first"}');
    yield* reconcileSites(served, (stale) => Effect.sync(() => void asked.push(stale)));
    expect(asked).toEqual([site]);
    yield* recordRelease(site, { seq: 1, release });
    asked.length = 0;
    yield* reconcileSites(served, (stale) => Effect.sync(() => void asked.push(stale)));
    expect(asked).toEqual([]);
  }).pipe(Effect.provide(core)),
);
