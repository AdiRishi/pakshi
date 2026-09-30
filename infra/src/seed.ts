import { createHash } from "node:crypto";

import type { DefaultRole, Scope } from "@repo/contracts/access";
import { LiveRelease, objectKeys, routingKeys, SnapshotManifest } from "@repo/contracts/snapshot";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import { Schema } from "effect";
import * as Effect from "effect/Effect";

import { testUsers } from "../../workers/test-identity-provider/src/users.ts";
import { dataPlane } from "./data-plane.ts";
import { fixtureSites } from "./fixture-sites.ts";
import { sampleSite } from "./sample-site.ts";

type TestUserId = (typeof testUsers)[number]["id"];

/** What each test user may do on the sample site, so every default role can be tried by signing in. */
const testGrants = (site: Extract<Scope, { kind: "site" }>["id"]) =>
  [
    { user: "user_meera", role: "org-admin", scope: { kind: "organization" } },
    { user: "user_sam", role: "editor", scope: { kind: "site", id: site } },
    { user: "user_jonah", role: "approver", scope: { kind: "site", id: site } },
  ] as const satisfies ReadonlyArray<{ user: TestUserId; role: DefaultRole; scope: Scope }>;

const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

/**
 * A hash of everything the seed writes. Alchemy reruns an Action only when its
 * input changes, so this makes an edited fixture, theme or grant reach a stage
 * that was seeded before.
 */
const seedContents = Effect.gen(function* () {
  const sample = yield* Effect.promise(sampleSite);
  const fixtures = yield* Effect.promise(fixtureSites);
  const manifests = yield* Effect.forEach([sample, ...fixtures], (published) =>
    Schema.encodeEffect(SnapshotManifest)(published.manifest).pipe(Effect.orDie),
  );
  return sha256(
    JSON.stringify({
      brand: sample.brand,
      sites: [sample.site, ...fixtures.map((fixture) => fixture.site)],
      manifests,
      // Every media field the seed writes, since suggested alt text reaches no manifest.
      media: sample.media.map(({ bytes, ...file }) => ({ ...file, bytes: sha256(bytes) })),
      users: testUsers,
      grants: testGrants(sample.site.id),
    }),
  );
});

/**
 * Seeds a non-production stage: the test users and their grants, the sample
 * site published at the Sites Worker's own host, and the block fixture sites
 * at `fixtures-N.` hosts beside it. Every write is an upsert, so running it
 * again leaves the same state.
 */
export const seedTestData = Effect.fn("Pakshi.SeedTestData")(function* (sites: {
  readonly url: Output.Output<string | undefined>;
}) {
  const data = yield* dataPlane;
  const seed = Alchemy.Action(
    "SeedTestData",
    Effect.gen(function* () {
      const db = yield* Cloudflare.D1.QueryDatabase(data.core);
      const content = yield* Cloudflare.R2.ReadWriteBucket(data.content);
      const routing = yield* Cloudflare.KV.ReadWriteNamespace(data.routing);
      return Effect.fn(function* (input: {
        readonly sitesHost: string;
        readonly contents: string;
      }) {
        const sample = yield* Effect.promise(sampleSite);
        const fixtures = yield* Effect.promise(fixtureSites);
        const published = [
          { ...sample, host: input.sitesHost },
          ...fixtures.map((fixture) => ({ ...fixture, host: fixture.host(input.sitesHost) })),
        ];
        const now = new Date().toISOString();
        yield* db.batch([
          db
            .prepare(
              "insert into brands (id, name) values (?, ?) on conflict (id) do update set name = excluded.name",
            )
            .bind(sample.brand.id, sample.brand.name),
          ...published.map(({ site }) =>
            db
              .prepare(
                "insert into sites (id, brand_id, name) values (?, ?, ?) on conflict (id) do update set name = excluded.name",
              )
              .bind(site.id, sample.brand.id, site.name),
          ),
          // The sample image is in the brand's library, so every site in the brand can place it.
          ...sample.media.map((file) =>
            db
              .prepare(
                `insert into media (id, brand_id, content_type, width, height, alt) values (?, ?, ?, ?, ?, ?)
                 on conflict (id) do update set site_id = null, brand_id = excluded.brand_id, alt = excluded.alt`,
              )
              .bind(file.id, sample.brand.id, file.contentType, file.width, file.height, file.alt),
          ),
          ...testUsers.map((user) =>
            db
              .prepare(
                `insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
                 values (?, ?, ?, 1, ?, ?) on conflict ("id") do nothing`,
              )
              .bind(user.id, user.name, user.email, now, now),
          ),
          ...testGrants(sample.site.id).map((grant) =>
            db
              .prepare(
                "insert into grants (user_id, role, scope_kind, scope_id) values (?, ?, ?, ?) on conflict do nothing",
              )
              .bind(
                grant.user,
                grant.role,
                grant.scope.kind,
                grant.scope.kind === "site" ? grant.scope.id : null,
              ),
          ),
        ]);
        for (const file of sample.media)
          yield* content.put(objectKeys.media(file.id), file.bytes, {
            httpMetadata: { contentType: file.contentType },
          });
        for (const site of published) {
          for (const { json, hash } of site.pages)
            yield* content.put(objectKeys.page(site.site.id, hash), JSON.stringify(json), {
              httpMetadata: { contentType: "application/json" },
            });
          yield* content.put(
            objectKeys.manifest(site.site.id, site.snapshot),
            JSON.stringify(yield* Schema.encodeEffect(SnapshotManifest)(site.manifest)),
            { httpMetadata: { contentType: "application/json" } },
          );
          yield* routing.put(routingKeys.host(site.host), site.site.id);
          yield* routing.put(
            routingKeys.site(site.site.id),
            JSON.stringify(
              yield* Schema.encodeEffect(LiveRelease)({
                release: site.release,
                snapshot: site.snapshot,
              }),
            ),
          );
        }
      });
    }).pipe(
      Effect.provide([
        Cloudflare.D1.QueryDatabaseLocal,
        Cloudflare.R2.ReadWriteBucketLocal,
        Cloudflare.KV.ReadWriteNamespaceLocal,
      ]),
    ),
  );
  yield* seed({
    sitesHost: Output.map(sites.url, (url) => new URL(url ?? "").host),
    contents: yield* seedContents,
  });
});
