import { expect, it } from "@effect/vitest";
import { type Draft, DraftName } from "@repo/contracts/draft";
import { BlockId, type DraftId, PageId } from "@repo/contracts/ids";
import type { ConflictKey, Side } from "@repo/contracts/merge";
import { Batch } from "@repo/contracts/ops";
import type { PageDocument } from "@repo/contracts/page";
import { liveReleaseOf } from "@repo/contracts/release";
import { ResolvedTheme } from "@repo/tokens";
import { Deferred, Effect, Fiber, Layer, Option, Schema } from "effect";

import { Site } from "../src/site/site.ts";
import { harbourLive, platform, siteService, storage } from "./support/site.ts";

const sam = { id: "user_sam", name: "Sam Okafor" };
const meera = { id: "user_meera", name: "Meera Kapoor" };

const name = Schema.decodeSync(DraftName);
const decodeBatch = Schema.decodeSync(Batch);
const encodeTheme = Schema.encodeSync(ResolvedTheme);

let batches = 0;
const setHeading = (value: string) => {
  batches += 1;
  return Schema.decodeSync(Batch)({
    id: `bat_${batches}`,
    ops: [{ op: "setProp", target: "pg_home", block: "b_hero", path: ["heading"], value }],
  });
};

const setIntro = (value: string) => {
  batches += 1;
  return Schema.decodeSync(Batch)({
    id: `bat_${batches}`,
    ops: [{ op: "setProp", target: "pg_home", block: "b_intro", path: ["heading"], value }],
  });
};

/** A test with a site whose SiteDoc starts over the seeded platform, with a handle on the platform. */
const withSite = <A, E>(
  test: (
    site: Site["Service"],
    state: Effect.Success<ReturnType<typeof platform>>["state"],
  ) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const { state, layer } = yield* platform();
    return yield* Site.use((site) => test(site, state)).pipe(
      Effect.provide(siteService(layer).pipe(Layer.provide(storage))),
    );
  });

const headingOn = (page: PageDocument | undefined, block = "b_hero") =>
  page?.blocks[BlockId.make(block)]?.props["heading"];

const heading = (draft: Pick<Draft, "pages">, block = "b_hero") =>
  headingOn(draft.pages[PageId.make("pg_home")], block);

const opened = (site: Site["Service"], id: DraftId) =>
  Effect.flatMap(site.open(sam, id), (result) =>
    result._tag === "Ready"
      ? Effect.succeed(result.draft)
      : Effect.die("The draft needs an update."),
  );

const published = (site: Site["Service"], id: DraftId) =>
  Effect.flatMap(site.publish(sam, id), (outcome) =>
    outcome._tag === "Published"
      ? Effect.succeed(outcome.release)
      : Effect.die(`Not published: ${outcome._tag}`),
  );

it.effect("a site SiteDoc hasn't recorded takes the release KV serves as its first", () =>
  withSite((site, state) =>
    Effect.gen(function* () {
      expect(yield* site.live).toMatchObject({ _tag: "Imported", id: harbourLive.release });
      yield* site.deliverOutbox;
      expect(Array.from(state.index.keys())).toEqual([harbourLive.release]);
    }),
  ),
);

it.effect("a new draft starts from the live release, and joins the drafts list", () =>
  withSite((site) =>
    Effect.gen(function* () {
      const summary = yield* site.createDraft(sam, name("Summer launch"));
      expect(summary).toMatchObject({ name: "Summer launch", status: "open", base: harbourLive });
      const draft = yield* opened(site, summary.id);
      expect(heading(draft)).toBe("Learn by building");
      expect((yield* site.drafts).map((draft) => draft.name)).toEqual(["Summer launch"]);
    }),
  ),
);

it.effect("publishing writes a snapshot, makes it live, closes the draft and tells everyone", () =>
  withSite((site, state) =>
    Effect.gen(function* () {
      const { id } = yield* site.createDraft(sam, name("New heading"));
      yield* site.applyBatch(sam, id, setHeading("Build a boat"));
      const release = yield* published(site, id);
      expect(release).toMatchObject({
        _tag: "Published",
        by: sam,
        draft: { id, name: "New heading" },
      });
      expect(state.routing).toEqual(Option.some(liveReleaseOf(release)));
      const manifest = state.manifests.get(release.snapshot);
      expect(manifest?.media).toEqual({
        med_harbour: { contentType: "image/jpeg", width: 1600, height: 1067 },
      });
      const [entry] = manifest?.pages ?? [];
      expect(headingOn(entry === undefined ? undefined : state.pages.get(entry.object))).toBe(
        "Build a boat",
      );
      expect((yield* site.summary(id)).status).toBe("published");
      expect(state.sent.slice(-2).map(({ draft, message }) => [draft, message._tag])).toEqual([
        [id, "DraftClosed"],
        [null, "LiveChanged"],
      ]);
      yield* site.deliverOutbox;
      expect(state.index.get(release.id)).toEqual({ seq: 2, release });
    }),
  ),
);

it.effect("a draft with an incomplete field isn't published", () =>
  withSite((site, state) =>
    Effect.gen(function* () {
      const { id } = yield* site.createDraft(sam, name("Empty heading"));
      yield* site.applyBatch(sam, id, setHeading(""));
      const outcome = yield* site.publish(sam, id);
      expect(outcome).toMatchObject({
        _tag: "Incomplete",
        incomplete: [{ block: { id: "b_hero", title: "Hero" }, path: ["heading"] }],
      });
      expect(state.routing).toEqual(Option.some(harbourLive));
      expect((yield* site.releases).length).toBe(1);
    }),
  ),
);

it.effect("two publishes started at once happen one after the other", () =>
  withSite((site) =>
    Effect.gen(function* () {
      const first = yield* site.createDraft(sam, name("Heading"));
      const second = yield* site.createDraft(meera, name("Intro"));
      yield* site.applyBatch(sam, first.id, setHeading("Build a boat"));
      yield* site.applyBatch(meera, second.id, setIntro("Why come"));
      const [a, b] = yield* Effect.all([published(site, first.id), published(site, second.id)], {
        concurrency: "unbounded",
      });
      const history = yield* site.releases;
      expect(history.map((release) => release.id)).toEqual([b.id, a.id, harbourLive.release]);
      // The second merged the first before it went live, so both changes are live.
      const summary = yield* site.summary(second.id);
      expect(summary.status).toBe("published");
      const restored = yield* site.restore(sam, b.id, name("Check"));
      const draft = yield* opened(site, Option.getOrThrow(restored).id);
      expect(heading(draft)).toBe("Build a boat");
      expect(heading(draft, "b_intro")).toBe("Why come");
    }),
  ),
);

it.effect("a draft edited while it's being published stays open with only its later edits", () =>
  withSite((site, state) =>
    Effect.gen(function* () {
      const { id } = yield* site.createDraft(sam, name("Heading"));
      yield* site.applyBatch(sam, id, setHeading("Build a boat"));
      const gate = yield* Deferred.make<void>();
      state.manifestGate = gate;
      const publishing = yield* Effect.forkChild(published(site, id));
      yield* Deferred.await(state.manifestWriting);
      // The snapshot is being written, and edits still commit meanwhile.
      expect(yield* site.applyBatch(meera, id, setIntro("Why come"))).toMatchObject({
        status: "committed",
      });
      yield* Deferred.succeed(gate, undefined);
      const release = yield* Fiber.join(publishing);
      const summary = yield* site.summary(id);
      expect(summary).toMatchObject({ status: "open", base: liveReleaseOf(release) });
      const draft = yield* opened(site, id);
      expect(heading(draft, "b_intro")).toBe("Why come");
      const live = yield* site.restore(sam, release.id, name("Live"));
      expect(heading(yield* opened(site, Option.getOrThrow(live).id), "b_intro")).toBe("About");
    }),
  ),
);

it.effect("rolling back makes the release before the latest publish live again, once", () =>
  withSite((site, state) =>
    Effect.gen(function* () {
      const { id } = yield* site.createDraft(sam, name("Heading"));
      yield* site.applyBatch(sam, id, setHeading("Build a boat"));
      const release = yield* published(site, id);
      const rollback = yield* site.rollBack(meera);
      expect(rollback).toMatchObject({
        _tag: "RolledBack",
        snapshot: harbourLive.snapshot,
        undid: release.id,
      });
      expect(state.routing).toEqual(Option.some(liveReleaseOf(rollback)));
      expect((yield* Effect.flip(site.rollBack(meera)))._tag).toBe("NothingToRollBack");
    }),
  ),
);

it.effect("restoring an older release makes a draft of it that starts from what's live", () =>
  withSite((site) =>
    Effect.gen(function* () {
      const { id } = yield* site.createDraft(sam, name("Heading"));
      yield* site.applyBatch(sam, id, setHeading("Build a boat"));
      const release = yield* published(site, id);
      const restored = Option.getOrThrow(
        yield* site.restore(meera, harbourLive.release, name("Old heading")),
      );
      expect(restored.base).toEqual(liveReleaseOf(release));
      expect(heading(yield* opened(site, restored.id))).toBe("Learn by building");
    }),
  ),
);

it.effect("a draft that's behind merges on opening when it's clean", () =>
  withSite((site) =>
    Effect.gen(function* () {
      const first = yield* site.createDraft(sam, name("Heading"));
      const second = yield* site.createDraft(meera, name("Intro"));
      yield* site.applyBatch(meera, second.id, setIntro("Why come"));
      yield* site.applyBatch(sam, first.id, setHeading("Build a boat"));
      const release = yield* published(site, first.id);
      const draft = yield* opened(site, second.id);
      expect(draft.base).toEqual(liveReleaseOf(release));
      expect([heading(draft), heading(draft, "b_intro")]).toEqual(["Build a boat", "Why come"]);
    }),
  ),
);

it.effect("a conflicting draft needs an update, which finishes once each conflict has a side", () =>
  withSite((site) =>
    Effect.gen(function* () {
      const first = yield* site.createDraft(sam, name("Heading"));
      const second = yield* site.createDraft(meera, name("Other heading"));
      yield* site.applyBatch(meera, second.id, setHeading("Sail a boat"));
      yield* site.applyBatch(sam, first.id, setHeading("Build a boat"));
      yield* published(site, first.id);
      expect(yield* site.open(meera, second.id)).toEqual({ _tag: "NeedsUpdate" });
      expect(yield* site.publish(meera, second.id)).toEqual({ _tag: "NeedsUpdate" });
      const preview = yield* site.previewUpdate(second.id, {});
      expect(preview.conflicts).toEqual([
        expect.objectContaining({ _tag: "Changed", draft: "Sail a boat", live: "Build a boat" }),
      ]);
      expect((yield* site.update(meera, second.id, {}))._tag).toBe("Unresolved");
      const choice: Record<ConflictKey, Side> = {};
      for (const conflict of preview.conflicts) choice[conflict.key] = "draft";
      expect(yield* site.update(meera, second.id, choice)).toEqual({ _tag: "Updated" });
      expect(heading(yield* opened(site, second.id))).toBe("Sail a boat");
    }),
  ),
);

it.effect("people can't move a draft onto a release, or change a closed draft", () =>
  withSite((site) =>
    Effect.gen(function* () {
      const { id } = yield* site.createDraft(sam, name("Heading"));
      const draft = yield* opened(site, id);
      const rebase = decodeBatch({
        id: "bat_rebase",
        ops: [
          {
            op: "rebase",
            base: { release: "rel_other", snapshot: "snap_other" },
            lockfile: draft.lockfile,
            theme: encodeTheme(draft.theme),
            settings: draft.settings,
            forms: {},
            menus: { main: [], footer: [] },
          },
        ],
      });
      expect(yield* site.applyBatch(sam, id, rebase)).toMatchObject({
        status: "rejected",
        errors: [{ rule: "system" }],
      });
      yield* site.closeDraft(sam, id);
      expect(yield* site.applyBatch(sam, id, setHeading("Too late"))).toMatchObject({
        status: "rejected",
        errors: [{ rule: "closed" }],
      });
    }),
  ),
);

it.effect("reconciling writes the live release to KV again, and queues its copy for D1", () =>
  withSite((site, state) =>
    Effect.gen(function* () {
      yield* site.deliverOutbox;
      state.index.clear();
      state.routing = Option.none();
      yield* site.reconcile;
      expect(state.routing).toEqual(Option.some(harbourLive));
      yield* site.deliverOutbox;
      expect(Array.from(state.index.keys())).toEqual([harbourLive.release]);
    }),
  ),
);
