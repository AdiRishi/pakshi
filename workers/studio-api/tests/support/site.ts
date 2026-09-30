import { SqliteClient } from "@effect/sql-sqlite-node";
import { MediaId, SiteId } from "@repo/contracts/ids";
import type { DraftId, SnapshotId } from "@repo/contracts/ids";
import type { ServerMessage } from "@repo/contracts/live";
import { PageDocument } from "@repo/contracts/page";
import {
  contentHash,
  type ContentHash,
  LiveRelease,
  type SnapshotManifest,
  SnapshotManifest as Manifest,
} from "@repo/contracts/snapshot";
import { harbour } from "@repo/tokens";
import { Deferred, Effect, Layer, Option, Schema } from "effect";
import * as Migrator from "effect/unstable/sql/Migrator";

import { SiteApprovals } from "../../src/site/approvals.ts";
import { SiteDrafts, SiteIdentity } from "../../src/site/drafts.ts";
import { migrations } from "../../src/site/migrations.ts";
import { type IndexedRelease, Outbox, type OutboxMessage } from "../../src/site/outbox.ts";
import {
  LiveUpdates,
  MediaLibrary,
  OutboxDelivery,
  Routing,
  Snapshots,
} from "../../src/site/platform.ts";
import { SiteReleases } from "../../src/site/releases.ts";
import { Site } from "../../src/site/site.ts";

export const site = SiteId.make("site_harbour");

const paragraph = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

export const home = Schema.decodeSync(PageDocument)({
  schema: "pakshi.page/1",
  id: "pg_home",
  type: "page",
  path: "/",
  meta: { title: "Harbour Summer School", description: "Five days at the harbour." },
  root: ["b_hero", "b_intro"],
  blocks: {
    b_hero: {
      type: "hero",
      variant: "centered",
      surface: "brand",
      props: {
        heading: "Learn by building",
        image: { $ref: "media", id: "med_harbour", alt: "Boats in the harbour" },
      },
    },
    b_intro: {
      type: "rich-text",
      variant: "narrow",
      surface: "default",
      props: { heading: "About", body: paragraph("Five days of workshops.") },
    },
  },
});

export const harbourLive = Schema.decodeSync(LiveRelease)({
  release: "rel_seeded",
  snapshot: "snap_seeded",
});

/** What the in-memory platform holds, for tests to read and change. */
export interface PlatformState {
  readonly pages: Map<ContentHash, PageDocument>;
  readonly manifests: Map<SnapshotId, SnapshotManifest>;
  /** What KV serves for the site. */
  routing: Option.Option<LiveRelease>;
  /** Whether writes to KV fail. */
  routingDown: boolean;
  /** D1's copy of the site's releases. */
  readonly index: Map<string, IndexedRelease>;
  /** Every outbox message delivered, oldest first. */
  readonly delivered: Array<OutboxMessage>;
  /** Messages to live connections: to one draft's, or with `null`, everyone's. */
  readonly sent: Array<{ readonly draft: DraftId | null; readonly message: ServerMessage }>;
  /** Holds each manifest write until opened, to act while a publish is under way. */
  manifestGate: Deferred.Deferred<void> | null;
  /** Done once a manifest write has started. */
  readonly manifestWriting: Deferred.Deferred<void>;
}

const encodeHome = Schema.encodeSync(PageDocument);
const decodeManifest = Schema.decodeSync(Manifest);
const encodeTheme = Schema.encodeSync(Manifest.fields.theme);

/**
 * R2, KV and D1 as a site's SiteDoc sees them, in memory, seeded with the
 * Harbour site published once, as the seed publishes the sample site.
 */
export const platform = Effect.fn("platform")(function* () {
  const pages = new Map<ContentHash, PageDocument>();
  const manifests = new Map<SnapshotId, SnapshotManifest>();
  const homeHash = yield* Effect.promise(() => contentHash(encodeHome(home)));
  pages.set(homeHash, home);
  manifests.set(
    harbourLive.snapshot,
    decodeManifest({
      schema: "pakshi.snapshot/1",
      id: harbourLive.snapshot,
      site,
      settings: { name: "Harbour Summer School" },
      parts: {
        header: "b_header",
        footer: "b_footer",
        blocks: {
          b_header: { type: "header", variant: "simple", surface: "default", props: {} },
          b_footer: { type: "footer", variant: "simple", surface: "muted", props: {} },
        },
        menus: { main: [], footer: [] },
      },
      forms: {},
      lockfile: { hero: 1, "rich-text": 1, header: 1, footer: 1 },
      theme: encodeTheme(harbour),
      media: { med_harbour: { contentType: "image/jpeg", width: 1600, height: 1067 } },
      pages: [{ id: "pg_home", path: "/", type: "page", meta: home.meta, object: homeHash }],
      gone: [],
    }),
  );
  const state: PlatformState = {
    pages,
    manifests,
    routing: Option.some(harbourLive),
    routingDown: false,
    index: new Map(),
    delivered: [],
    sent: [],
    manifestGate: null,
    manifestWriting: yield* Deferred.make<void>(),
  };
  const layer = Layer.mergeAll(
    Layer.succeed(Snapshots)({
      manifest: (snapshot) =>
        Effect.sync(() => {
          const manifest = manifests.get(snapshot);
          if (manifest === undefined) throw new Error(`No snapshot ${snapshot}`);
          return manifest;
        }),
      page: (hash) =>
        Effect.sync(() => {
          const page = pages.get(hash);
          if (page === undefined) throw new Error(`No page object ${hash}`);
          return page;
        }),
      writePage: (hash, page) => Effect.sync(() => void pages.set(hash, page)),
      writeManifest: (manifest) =>
        Effect.gen(function* () {
          yield* Deferred.succeed(state.manifestWriting, undefined);
          if (state.manifestGate !== null) yield* Deferred.await(state.manifestGate);
          manifests.set(manifest.id, manifest);
        }),
    }),
    Layer.succeed(Routing)({
      read: Effect.sync(() => state.routing),
      write: (live) =>
        state.routingDown
          ? Effect.die(new Error("KV is unavailable"))
          : Effect.sync(() => void (state.routing = Option.some(live))),
    }),
    Layer.succeed(MediaLibrary)({
      files: (ids) =>
        Effect.succeed(
          new Map(
            ids.flatMap((id) =>
              id === MediaId.make("med_harbour")
                ? [[id, { contentType: "image/jpeg", width: 1600, height: 1067 }] as const]
                : [],
            ),
          ),
        ),
    }),
    Layer.succeed(OutboxDelivery)({
      deliver: (message) =>
        Effect.sync(() => {
          state.delivered.push(message);
          if (message._tag === "Release")
            state.index.set(message.release.release.id, message.release);
        }),
    }),
    Layer.succeed(LiveUpdates)({
      send: (draft, message) => Effect.sync(() => void state.sent.push({ draft, message })),
    }),
  );
  return { state, layer };
});

/** A SiteDoc's storage: a fresh SQLite database with its schema applied. */
export const storage = Layer.effectDiscard(Migrator.make({})({ loader: migrations })).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" })),
  Layer.provideMerge(Layer.succeed(SiteIdentity)({ site })),
);

/** The Site service as a freshly started SiteDoc builds it, over the storage and platform given. */
export const siteService = <R>(
  platformLayer: Layer.Layer<
    Snapshots | Routing | MediaLibrary | OutboxDelivery | LiveUpdates,
    never,
    R
  >,
) =>
  Layer.fresh(
    Site.layer.pipe(
      Layer.provide(Layer.mergeAll(SiteDrafts.layer, SiteReleases.layer, SiteApprovals.layer)),
      Layer.provideMerge(Outbox.layer),
      Layer.provide(platformLayer),
    ),
  );
