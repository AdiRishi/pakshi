import { expect, it } from "@effect/vitest";
import type { MediaId, SiteId } from "@repo/contracts/ids";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

import { purgeDeletedSites } from "../src/deletion.ts";
import { core } from "./support/core.ts";

it.effect(
  "deletes for good a site deleted more than 30 days ago, with its library and grants, and keeps a recent one",
  () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`update sites set deleted_at = '2026-01-01T00:00:00.000Z' where id = 'site_a1'`;
      yield* sql`update sites set deleted_at = ${new Date().toISOString()} where id = 'site_b1'`;
      const erased: Array<SiteId> = [];
      const files: Array<MediaId> = [];
      const purged = yield* purgeDeletedSites(
        (site) => Effect.sync(() => void erased.push(site)),
        (media) => Effect.sync(() => void files.push(media)),
      );
      expect(purged).toEqual(["site_a1"]);
      expect(erased).toEqual(["site_a1"]);
      expect(files).toEqual(["med_reading"]);
      const sites = yield* sql<{ readonly id: string }>`select id from sites order by id`;
      expect(sites.map(({ id }) => id)).toEqual(["site_a2", "site_b1"]);
      const grants = yield* sql`select 1 from grants where scope_id = 'site_a1'`;
      expect(grants).toEqual([]);
    }).pipe(Effect.provide(core)),
);
