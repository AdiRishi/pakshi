import { expect, it } from "@effect/vitest";
import { type MediaId, SiteId } from "@repo/contracts/ids";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

import { deleteSite, purgeDeletedSites, restoreSite, type SiteHosts } from "../src/deletion.ts";
import { removeDomain } from "../src/domains.ts";
import { core } from "./support/core.ts";

const orgAdmin = { id: "user_org", name: "user_org", email: "org@riverton.test" };
const library = SiteId.make("site_a1");

/** A site answering at its subdomain and at a connected domain. */
const routedSite = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`update sites set address = 'library' where id = ${library}`;
  yield* sql`insert into domains (hostname, site_id, status, token)
    values ('www.library.org', ${library}, 'active', 'token')`;
});

/** KV as the caller's callbacks see it: refusing the first change, then taking each. */
const flakyKv = () => {
  const taken: Array<string> = [];
  let refused = false;
  const change = (description: string) =>
    Effect.suspend(() => {
      if (!refused) {
        refused = true;
        return Effect.die("KV is unavailable");
      }
      taken.push(description);
      return Effect.void;
    });
  return { taken, change };
};

const deletedAt = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const [row] = yield* sql<{ readonly deleted_at: string | null }>`select deleted_at
    from sites where id = ${library}`;
  return row?.deleted_at ?? null;
});

it.effect("a deletion KV refuses changes nothing, so deleting the site again finishes it", () =>
  Effect.gen(function* () {
    yield* routedSite;
    const kv = flakyKv();
    const unroute = (hosts: SiteHosts) => kv.change([hosts.address, ...hosts.domains].join(" "));
    yield* Effect.exit(deleteSite(orgAdmin, library, unroute));
    expect(yield* deletedAt).toBeNull();

    yield* deleteSite(orgAdmin, library, unroute);
    expect(kv.taken).toEqual(["library www.library.org"]);
    expect(yield* deletedAt).not.toBeNull();
  }).pipe(Effect.provide(core)),
);

it.effect("a restore KV refuses changes nothing, so restoring the site again finishes it", () =>
  Effect.gen(function* () {
    yield* routedSite;
    yield* deleteSite(orgAdmin, library, () => Effect.void);
    const kv = flakyKv();
    yield* Effect.exit(restoreSite(orgAdmin, library, kv.change));
    expect(yield* deletedAt).not.toBeNull();

    yield* restoreSite(orgAdmin, library, kv.change);
    expect(kv.taken).toEqual(["library"]);
    expect(yield* deletedAt).toBeNull();
  }).pipe(Effect.provide(core)),
);

it.effect("a domain removal KV refuses keeps the domain, so removing it again finishes it", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* routedSite;
    const kv = flakyKv();
    yield* Effect.exit(removeDomain(library, "www.library.org", orgAdmin, kv.change));
    expect(yield* sql`select hostname from domains`).toEqual([{ hostname: "www.library.org" }]);

    yield* removeDomain(library, "www.library.org", orgAdmin, kv.change);
    expect(kv.taken).toEqual(["www.library.org"]);
    expect(yield* sql`select hostname from domains`).toEqual([]);
  }).pipe(Effect.provide(core)),
);

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
