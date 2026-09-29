import { SqliteClient } from "@effect/sql-sqlite-node";
import { expect, it } from "@effect/vitest";
import { BlockId, PageId, SiteId } from "@repo/contracts/ids";
import { Batch } from "@repo/contracts/ops";
import { PageDocument } from "@repo/contracts/page";
import { LiveRelease, SnapshotManifest } from "@repo/contracts/snapshot";
import { harbour } from "@repo/tokens";
import { Effect, Layer, Schema } from "effect";
import * as Migrator from "effect/unstable/sql/Migrator";

import { type LiveSnapshot, migrations, SiteDrafts, SiteSource } from "../src/drafts.ts";

const site = SiteId.make("site_harbour");

const home = Schema.decodeSync(PageDocument)({
  schema: "pakshi.page/1",
  id: "pg_home",
  type: "page",
  path: "/",
  meta: { title: "Harbour Summer School", description: "Five days at the harbour." },
  root: ["b_hero"],
  blocks: {
    b_hero: {
      type: "hero",
      variant: "centered",
      surface: "brand",
      props: { heading: "Learn by building" },
    },
  },
});

const live: LiveSnapshot = {
  live: Schema.decodeSync(LiveRelease)({ release: "rel_one", snapshot: "snap_one" }),
  manifest: Schema.decodeSync(SnapshotManifest)({
    schema: "pakshi.snapshot/1",
    id: "snap_one",
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
    lockfile: { hero: 1, header: 1, footer: 1 },
    theme: harbour,
    media: {},
    pages: [{ id: "pg_home", path: "/", type: "page", meta: home.meta, object: "a".repeat(64) }],
    gone: [],
  }),
  pages: [home],
};

/** A SiteDoc's storage: a fresh SQLite database with the drafts schema applied. */
const storage = Layer.effectDiscard(Migrator.make({})({ loader: migrations })).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" })),
  Layer.provideMerge(Layer.succeed(SiteSource)({ site, liveSnapshot: Effect.succeed(live) })),
);

/** The site's drafts as a freshly started SiteDoc sees them, over the same storage. */
const drafts = Effect.provide(
  SiteDrafts.use((service) => Effect.succeed(service)),
  Layer.fresh(SiteDrafts.layer),
);

const batch = (id: string, ops: typeof Batch.Encoded.ops) => Schema.decodeSync(Batch)({ id, ops });

const setHeading = (id: string, heading: string) =>
  batch(id, [
    { op: "setProp", target: "pg_home", block: "b_hero", path: ["heading"], value: heading },
  ]);

const heading = (draft: Effect.Success<Effect.Success<typeof drafts>["draft"]>) =>
  draft.pages[PageId.make("pg_home")]?.blocks[BlockId.make("b_hero")]?.props["heading"];

it.effect("a site's first draft starts from its live release", () =>
  Effect.gen(function* () {
    const draft = yield* (yield* drafts).draft;
    expect(draft.base).toEqual(live.live);
    expect(draft.revision).toBe(0);
    expect(Object.keys(draft.pages)).toEqual(["pg_home"]);
    expect(draft.parts.header).toBe("b_header");
  }).pipe(Effect.provide(storage)),
);

it.effect("a committed batch survives the object restarting", () =>
  Effect.gen(function* () {
    const first = yield* drafts;
    expect(yield* first.applyBatch("user_sam", setHeading("bat_one", "Build and sail"))).toEqual({
      status: "committed",
      revision: 1,
    });
    const restarted = yield* (yield* drafts).draft;
    expect(restarted.revision).toBe(1);
    expect(heading(restarted)).toBe("Build and sail");
  }).pipe(Effect.provide(storage)),
);

it.effect("a batch sent twice applies once", () =>
  Effect.gen(function* () {
    const store = yield* drafts;
    yield* store.applyBatch("user_sam", setHeading("bat_one", "Build and sail"));
    yield* store.applyBatch("user_sam", setHeading("bat_two", "Sail"));
    expect(yield* store.applyBatch("user_sam", setHeading("bat_one", "Build and sail"))).toEqual({
      status: "committed",
      revision: 1,
    });
    expect(heading(yield* store.draft)).toBe("Sail");
  }).pipe(Effect.provide(storage)),
);

it.effect("a rejected batch changes nothing and says why", () =>
  Effect.gen(function* () {
    const store = yield* drafts;
    const outcome = yield* store.applyBatch("user_sam", setHeading("bat_long", "x".repeat(81)));
    expect(outcome).toMatchObject({
      status: "rejected",
      errors: [{ rule: "value", path: ["heading"] }],
    });
    const draft = yield* (yield* drafts).draft;
    expect(draft.revision).toBe(0);
    expect(heading(draft)).toBe("Learn by building");
  }).pipe(Effect.provide(storage)),
);

it.effect("created and deleted pages are stored as their own rows", () =>
  Effect.gen(function* () {
    const store = yield* drafts;
    yield* store.applyBatch(
      "user_sam",
      batch("bat_create", [
        {
          op: "createPage",
          page: {
            schema: "pakshi.page/1",
            id: "pg_visit",
            type: "page",
            path: "/visit",
            meta: { title: "Visit", description: "" },
            root: [],
            blocks: {},
          },
        },
      ]),
    );
    expect(Object.keys((yield* (yield* drafts).draft).pages).toSorted()).toEqual([
      "pg_home",
      "pg_visit",
    ]);
    yield* store.applyBatch(
      "user_sam",
      batch("bat_delete", [{ op: "deletePage", page: "pg_home" }]),
    );
    expect(Object.keys((yield* (yield* drafts).draft).pages)).toEqual(["pg_visit"]);
  }).pipe(Effect.provide(storage)),
);
