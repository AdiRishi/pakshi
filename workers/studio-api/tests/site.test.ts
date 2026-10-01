import { describe, expect, it } from "@effect/vitest";
import { latestLockfile } from "@repo/blocks";
import type { BrandRevision } from "@repo/contracts/brand";
import { type Draft, DraftName } from "@repo/contracts/draft";
import { BlockId, BlockType, type DraftId, PageId, TurnId } from "@repo/contracts/ids";
import type { Collaborator } from "@repo/contracts/live";
import type { ConflictKey, Side } from "@repo/contracts/merge";
import { Batch } from "@repo/contracts/ops";
import type { PageDocument } from "@repo/contracts/page";
import { liveReleaseOf } from "@repo/contracts/release";
import type { LiveRelease } from "@repo/contracts/snapshot";
import type { Submission } from "@repo/contracts/submission";
import type { Workflow } from "@repo/contracts/workflow";
import type { Approver } from "@repo/domain/approvals";
import { resolveTheme } from "@repo/tokens";
import { Deferred, Effect, Fiber, Layer, Option, Schema } from "effect";

import { Site } from "../src/site/site.ts";
import {
  encodeBrand,
  harbourBrand,
  harbourLive,
  platform,
  type PlatformState,
  siteService,
  storage,
} from "./support/site.ts";

const sam = { id: "user_sam", name: "Sam Okafor" };
const meera = { id: "user_meera", name: "Meera Kapoor" };
const jonah = { id: "user_jonah", name: "Jonah Reyes" };
const priya = { id: "user_priya", name: "Priya Shah" };

const approver = (person: Collaborator, roles: Approver["roles"] = []): Approver => ({
  person,
  roles,
  permissions: ["site.approve"],
});

/** Any approver, then Meera. */
const twoSteps: Workflow = [
  { name: "Communications team", roles: ["approver"], people: [], required: 1 },
  { name: "Library manager", roles: [], people: [meera], required: 1 },
];

const name = Schema.decodeSync(DraftName);
const decodeBatch = Schema.decodeSync(Batch);

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
  test: (site: Site["Service"], state: PlatformState) => Effect.Effect<A, E>,
  served?: Option.Option<LiveRelease>,
) =>
  Effect.gen(function* () {
    const { state, layer } = yield* platform(served);
    return yield* Site.use((site) => test(site, state)).pipe(
      Effect.provide(siteService(layer).pipe(Layer.provide(storage))),
    );
  });

const headingOn = (page: PageDocument | undefined, block = "b_hero") =>
  page?.blocks[BlockId.make(block)]?.props["heading"];

const heading = (draft: Pick<Draft, "pages">, block = "b_hero") =>
  headingOn(draft.pages[PageId.make("pg_home")], block);

/** Submits a draft through a workflow with steps, and returns the submission. */
const submitted = (site: Site["Service"], id: DraftId, steps: Workflow = twoSteps, actor = sam) =>
  Effect.flatMap(site.submit(actor, id, "Ready for a look", steps, studio), (outcome) =>
    outcome._tag === "Submitted"
      ? Effect.succeed(outcome.submission)
      : Effect.die(`Not submitted: ${outcome._tag}`),
  );

const approve = (site: Site["Service"], who: Approver, submission: Submission) =>
  site.decide(who, submission.id, submission.snapshot, "approve", "", studio);

const opened = (site: Site["Service"], id: DraftId) =>
  Effect.flatMap(site.open(sam, id), (result) =>
    result._tag === "Ready"
      ? Effect.succeed(result.draft)
      : Effect.die("The draft needs an update."),
  );

/** Studio's address, which links in notification emails start with. */
const studio = "https://studio.pakshi.test";

/** Submits a draft through a workflow with no steps, which publishes it. */
const publish = (site: Site["Service"], id: DraftId, actor = sam) =>
  site.submit(actor, id, "", [], studio);

const published = (site: Site["Service"], id: DraftId, actor = sam) =>
  Effect.flatMap(publish(site, id, actor), (outcome) =>
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

it.effect(
  "a new site goes live with its brand, a header, a footer and no pages, and opens in a first draft with a home page",
  () =>
    withSite(
      (site, state) =>
        Effect.gen(function* () {
          const brand = { ...harbourBrand, number: 4 };
          const launch = yield* site.start(sam, "Harbour Summer School", brand);
          const live = yield* site.live;
          expect(live).toMatchObject({ _tag: "Created", by: sam });
          expect(state.routing).toEqual(Option.some(liveReleaseOf(live)));
          const manifest = state.manifests.get(live.snapshot);
          expect(manifest?.pages).toEqual([]);
          expect(manifest?.settings.name).toBe("Harbour Summer School");
          expect(manifest?.brand.number).toBe(4);
          expect(manifest?.lockfile).toEqual(latestLockfile);
          expect(
            Object.values(manifest?.parts.blocks ?? {})
              .map((block) => block.type)
              .toSorted(),
          ).toEqual(["footer", "header"]);
          expect(launch).toMatchObject({
            name: "Launch",
            status: "open",
            base: liveReleaseOf(live),
          });
          const draft = yield* opened(site, launch.id);
          expect(Object.values(draft.pages)).toMatchObject([
            { path: "/", meta: { title: "Harbour Summer School" }, root: [] },
          ]);
          expect(yield* site.takeBrandRevision(sam, brand)).toEqual({ _tag: "Taken" });
        }),
      Option.none(),
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
      const outcome = yield* publish(site, id);
      expect(outcome).toMatchObject({
        _tag: "Blocked",
        issues: [{ _tag: "Incomplete", block: { id: "b_hero", title: "Hero" }, path: ["heading"] }],
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
      const rollback = yield* site.rollBack(meera, studio);
      expect(rollback).toMatchObject({
        _tag: "RolledBack",
        snapshot: harbourLive.snapshot,
        undid: release.id,
      });
      expect(state.routing).toEqual(Option.some(liveReleaseOf(rollback)));
      expect((yield* Effect.flip(site.rollBack(meera, studio)))._tag).toBe("NothingToRollBack");
    }),
  ),
);

it.effect(
  "a site's name goes live with the next publish, and a rollback brings back the name its release had",
  () =>
    withSite((site, state) =>
      Effect.gen(function* () {
        const liveName = Effect.map(
          site.live,
          (live) => state.manifests.get(live.snapshot)?.settings.name,
        );
        const { revision } = yield* site.settings;
        yield* site.saveSettings(meera, { name: "Harbour Summer Studio" }, revision);
        expect(yield* liveName).toBe("Harbour Summer School");

        const { id } = yield* site.createDraft(sam, name("Heading"));
        yield* site.applyBatch(sam, id, setHeading("Build a boat"));
        yield* published(site, id);
        expect(yield* liveName).toBe("Harbour Summer Studio");

        yield* site.rollBack(meera, studio);
        expect(yield* liveName).toBe("Harbour Summer School");
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
      expect(yield* publish(site, second.id, meera)).toEqual({ _tag: "NeedsUpdate" });
      const preview = yield* site.previewUpdate(second.id, {});
      expect(preview.conflicts).toEqual([
        expect.objectContaining({ _tag: "Changed", draft: "Sail a boat", live: "Build a boat" }),
      ]);
      expect((yield* site.update(meera, second.id, {}, preview.to.id))._tag).toBe("Unresolved");
      const choice: Record<ConflictKey, Side> = {};
      for (const conflict of preview.conflicts) choice[conflict.key] = "draft";
      expect(yield* site.update(meera, second.id, choice, preview.to.id)).toEqual({
        _tag: "Updated",
      });
      expect(heading(yield* opened(site, second.id))).toBe("Sail a boat");
    }),
  ),
);

it.effect("people can't move a draft onto a release", () =>
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
            brand: encodeBrand(draft.brand),
            forms: {},
            menus: { main: [], footer: [] },
          },
        ],
      });
      expect(yield* site.applyBatch(sam, id, rebase)).toMatchObject({
        status: "rejected",
        errors: [{ rule: "system" }],
      });
      expect((yield* opened(site, id)).base).toEqual(harbourLive);
    }),
  ),
);

it.effect("a closed draft takes no more edits, and keeps its name", () =>
  withSite((site) =>
    Effect.gen(function* () {
      const { id } = yield* site.createDraft(sam, name("Heading"));
      yield* site.closeDraft(sam, id);
      expect(yield* site.applyBatch(sam, id, setHeading("Too late"))).toMatchObject({
        status: "rejected",
        errors: [{ rule: "closed" }],
      });
      expect((yield* Effect.flip(site.renameDraft(id, name("Other"))))._tag).toBe("DraftNotFound");
      expect((yield* site.summary(id)).name).toBe("Heading");
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

it.effect("closing a draft while it's being published waits for the publish", () =>
  withSite((site, state) =>
    Effect.gen(function* () {
      const { id } = yield* site.createDraft(sam, name("Heading"));
      yield* site.applyBatch(sam, id, setHeading("Build a boat"));
      const gate = yield* Deferred.make<void>();
      state.manifestGate = gate;
      const publishing = yield* Effect.forkChild(published(site, id));
      yield* Deferred.await(state.manifestWriting);
      const closing = yield* Effect.forkChild(Effect.flip(site.closeDraft(meera, id)));
      yield* Deferred.succeed(gate, undefined);
      const release = yield* Fiber.join(publishing);
      expect((yield* Fiber.join(closing))._tag).toBe("DraftNotFound");
      expect((yield* site.summary(id)).status).toBe("published");
      expect(state.routing).toEqual(Option.some(liveReleaseOf(release)));
    }),
  ),
);

it.effect("sides chosen against a release that's no longer live are asked for again", () =>
  withSite((site) =>
    Effect.gen(function* () {
      const first = yield* site.createDraft(sam, name("First"));
      const behind = yield* site.createDraft(meera, name("Behind"));
      const third = yield* site.createDraft(sam, name("Third"));
      yield* site.applyBatch(meera, behind.id, setHeading("Sail a boat"));
      yield* site.applyBatch(sam, first.id, setHeading("Build a boat"));
      yield* published(site, first.id);
      const preview = yield* site.previewUpdate(behind.id, {});
      const choice: Record<ConflictKey, Side> = {};
      for (const conflict of preview.conflicts) choice[conflict.key] = "draft";
      // Another release goes live while Meera decides.
      yield* site.applyBatch(sam, third.id, setIntro("Why come"));
      yield* published(site, third.id);
      const outcome = yield* site.update(meera, behind.id, choice, preview.to.id);
      expect(outcome._tag).toBe("Unresolved");
      expect((yield* site.summary(behind.id)).base.release).toBe(preview.from.id);
    }),
  ),
);

it.effect("a release whose KV write fails still reaches D1, so reconciling can repair KV", () =>
  withSite((site, state) =>
    Effect.gen(function* () {
      yield* site.deliverOutbox;
      const { id } = yield* site.createDraft(sam, name("Heading"));
      yield* site.applyBatch(sam, id, setHeading("Build a boat"));
      state.routingDown = true;
      yield* Effect.exit(publish(site, id));
      expect(state.routing).toEqual(Option.some(harbourLive));
      expect(yield* site.undelivered).toBe(true);
      yield* site.deliverOutbox;
      const live = yield* site.live;
      expect(state.index.has(live.id)).toBe(true);
      state.routingDown = false;
      yield* site.reconcile;
      expect(state.routing).toEqual(Option.some(liveReleaseOf(live)));
    }),
  ),
);

it.effect("a submission goes through each step, and the last approval publishes it", () =>
  withSite((site, state) =>
    Effect.gen(function* () {
      const { id } = yield* site.createDraft(sam, name("Heading"));
      yield* site.applyBatch(sam, id, setHeading("Build a boat"));
      const submission = yield* submitted(site, id);
      expect(submission).toMatchObject({ status: { _tag: "InReview" }, editedBy: [sam] });
      expect(state.routing).toEqual(Option.some(harbourLive));
      const first = yield* approve(site, approver(jonah, ["approver"]), submission);
      expect(first).toMatchObject({
        _tag: "Recorded",
        submission: { approvals: [{ step: 0, by: jonah }] },
      });
      const last = yield* approve(site, approver(meera), submission);
      if (last._tag !== "Published") return yield* Effect.die(`Not published: ${last._tag}`);
      expect(last.release).toMatchObject({
        by: meera,
        submittedBy: sam,
        approvedBy: [jonah, meera],
      });
      expect(state.routing).toEqual(Option.some(liveReleaseOf(last.release)));
      expect((yield* site.summary(id)).status).toBe("published");
      yield* site.deliverOutbox;
      const notified = state.delivered.flatMap((message) =>
        message._tag === "Notify" ? [message.notification._tag] : [],
      );
      expect(notified).toEqual(["StepStarted", "StepStarted", "Published"]);
    }),
  ),
);

it.effect("when two final approvals race, exactly one release goes live", () =>
  withSite((site) =>
    Effect.gen(function* () {
      const { id } = yield* site.createDraft(sam, name("Heading"));
      yield* site.applyBatch(sam, id, setHeading("Build a boat"));
      const submission = yield* submitted(site, id, [
        { name: "Managers", roles: [], people: [meera, priya], required: 1 },
      ]);
      const outcomes = yield* Effect.all(
        [approve(site, approver(meera), submission), approve(site, approver(priya), submission)],
        { concurrency: "unbounded" },
      );
      expect(outcomes.map((outcome) => outcome._tag).toSorted()).toEqual(["Closed", "Published"]);
      expect((yield* site.releases).length).toBe(2);
    }),
  ),
);

it.effect(
  "a clean merge during review keeps the approvals, and refuses decisions on the old version",
  () =>
    withSite((site) =>
      Effect.gen(function* () {
        const reviewed = yield* site.createDraft(sam, name("Heading"));
        const other = yield* site.createDraft(meera, name("Intro"));
        yield* site.applyBatch(sam, reviewed.id, setHeading("Build a boat"));
        yield* site.applyBatch(meera, other.id, setIntro("Why come"));
        const loaded = yield* submitted(site, reviewed.id);
        yield* approve(site, approver(jonah, ["approver"]), loaded);
        yield* published(site, other.id, meera);
        const merged = yield* site.submission(loaded.id);
        expect(merged.snapshot).not.toBe(loaded.snapshot);
        expect(merged.approvals.map((approval) => approval.by)).toEqual([jonah]);
        // Reviewers see only the version they decide on.
        expect(yield* site.submissionView(loaded.id, loaded.snapshot, "submitted", "/")).toEqual({
          _tag: "Changed",
        });
        expect(yield* approve(site, approver(meera), loaded)).toMatchObject({ _tag: "Stale" });
        const last = yield* approve(site, approver(meera), merged);
        if (last._tag !== "Published") return yield* Effect.die(`Not published: ${last._tag}`);
        const live = yield* site.restore(sam, last.release.id, name("Check"));
        const draft = yield* opened(site, Option.getOrThrow(live).id);
        expect([heading(draft), heading(draft, "b_intro")]).toEqual(["Build a boat", "Why come"]);
      }),
    ),
);

it.effect(
  "a merge during review that needs a person sends the submission back, and resubmitting starts over",
  () =>
    withSite((site, state) =>
      Effect.gen(function* () {
        const reviewed = yield* site.createDraft(sam, name("Heading"));
        const other = yield* site.createDraft(meera, name("Other heading"));
        yield* site.applyBatch(sam, reviewed.id, setHeading("Build a boat"));
        yield* site.applyBatch(meera, other.id, setHeading("Sail a boat"));
        const loaded = yield* submitted(site, reviewed.id);
        yield* approve(site, approver(jonah, ["approver"]), loaded);
        yield* published(site, other.id, meera);
        expect((yield* site.submission(loaded.id)).status._tag).toBe("NeedsUpdate");
        yield* site.deliverOutbox;
        expect(state.delivered).toContainEqual(
          expect.objectContaining({ _tag: "Notify", notification: { _tag: "NeedsUpdate" } }),
        );
        const preview = yield* site.previewUpdate(reviewed.id, {});
        const choice: Record<ConflictKey, Side> = {};
        for (const conflict of preview.conflicts) choice[conflict.key] = "draft";
        yield* site.update(sam, reviewed.id, choice, preview.to.id);
        const again = yield* submitted(site, reviewed.id);
        expect(again).toMatchObject({ approvals: [], status: { _tag: "InReview" } });
      }),
    ),
);

it.effect("pre-flight blocks a submission while a placeholder remains", () =>
  withSite((site) =>
    Effect.gen(function* () {
      const { id } = yield* site.createDraft(sam, name("Placeholder"));
      yield* site.applyBatch(sam, id, setHeading("Start with the one thing people should know"));
      expect((yield* site.check(id)).issues).toMatchObject([
        { _tag: "Placeholder", block: { id: "b_hero" }, path: ["heading"] },
      ]);
      const outcome = yield* site.submit(sam, id, "", twoSteps, studio);
      expect(outcome).toMatchObject({ _tag: "Blocked", issues: [{ _tag: "Placeholder" }] });
      expect((yield* site.summary(id)).review).toBeNull();
    }),
  ),
);

it.effect("requesting changes returns the submission with the note, and the draft stays open", () =>
  withSite((site) =>
    Effect.gen(function* () {
      const { id } = yield* site.createDraft(sam, name("Heading"));
      yield* site.applyBatch(sam, id, setHeading("Build a boat"));
      const submission = yield* submitted(site, id);
      const outcome = yield* site.decide(
        approver(jonah, ["approver"]),
        submission.id,
        submission.snapshot,
        "request-changes",
        "Say which boat.",
        studio,
      );
      expect(outcome).toMatchObject({
        _tag: "Recorded",
        submission: { status: { _tag: "ChangesRequested", by: jonah, note: "Say which boat." } },
      });
      const summary = yield* site.summary(id);
      expect(summary).toMatchObject({
        status: "open",
        review: { status: { _tag: "ChangesRequested" } },
      });
    }),
  ),
);

it.effect(
  "submitting a draft again replaces its submission, and closing it withdraws the new one",
  () =>
    withSite((site) =>
      Effect.gen(function* () {
        const { id } = yield* site.createDraft(sam, name("Heading"));
        yield* site.applyBatch(sam, id, setHeading("Build a boat"));
        const first = yield* submitted(site, id);
        const second = yield* submitted(site, id);
        expect((yield* site.submission(first.id)).status._tag).toBe("Replaced");
        yield* site.closeDraft(meera, id);
        expect((yield* site.submission(second.id)).status).toMatchObject({
          _tag: "Withdrawn",
          by: meera,
        });
        expect(yield* approve(site, approver(jonah, ["approver"]), second)).toMatchObject({
          _tag: "Closed",
        });
      }),
    ),
);

it.effect("a draft's sharing decides who may open it, until the draft closes", () =>
  withSite((site, state) =>
    Effect.gen(function* () {
      const { id } = yield* site.createDraft(sam, name("Shared"));
      yield* site.share(id, {
        people: [{ person: { ...priya, email: "priya@pakshi.test" }, access: "edit" }],
        general: { audience: "link", access: "view" },
      });
      expect(yield* site.access(id, { id: null })).toBe("view");
      expect(yield* site.access(id, { id: priya.id, editsSite: false })).toBe("edit");
      yield* site.closeDraft(sam, id);
      expect(yield* site.access(id, { id: null })).toBeNull();
      yield* site.deliverOutbox;
      const shares = state.delivered.flatMap((message) =>
        message._tag === "Shares" ? [message.people.map((person) => person.id)] : [],
      );
      expect(shares).toEqual([[priya.id], []]);
    }),
  ),
);

it.effect("a preview shows the draft's latest saved page, and a review marks what changed", () =>
  withSite((site) =>
    Effect.gen(function* () {
      const { id } = yield* site.createDraft(sam, name("Heading"));
      yield* site.applyBatch(sam, id, setHeading("Build a boat"));
      const preview = yield* site.draftView(id, "/");
      expect(preview.name).toBe("Heading");
      expect(headingOn(preview.view.page ?? undefined)).toBe("Build a boat");
      expect(preview.view.media).toEqual({
        med_harbour: { contentType: "image/jpeg", width: 1600, height: 1067 },
      });
      expect((yield* site.draftView(id, "/missing")).view.page).toBeNull();
      const submission = yield* submitted(site, id);
      const shown = (version: "submitted" | "live") =>
        Effect.flatMap(
          site.submissionView(submission.id, submission.snapshot, version, "/"),
          (page) => (page._tag === "Page" ? Effect.succeed(page) : Effect.die("It changed.")),
        );
      expect((yield* shown("submitted")).changed).toEqual(["b_hero"]);
      expect(headingOn((yield* shown("live")).view.page ?? undefined)).toBe("Learn by building");
      expect((yield* site.review(submission.id)).changes).toMatchObject([
        { _tag: "ValueChanged", block: { id: "b_hero" }, field: "Heading" },
      ]);
    }),
  ),
);

describe("the agent's turns", () => {
  const turn = TurnId.make("turn_one");

  it.effect("commit as the person, held to completeness", () =>
    withSite((site) =>
      Effect.gen(function* () {
        const { id } = yield* site.createDraft(sam, name("Agent edits"));
        expect(yield* site.applyAgentBatch(sam, id, setHeading(""), turn)).toMatchObject({
          status: "rejected",
          errors: [{ rule: "incomplete" }],
        });
        expect(
          yield* site.applyAgentBatch(sam, id, setHeading("Build a boat"), turn),
        ).toMatchObject({ status: "committed", commit: { batch: { actor: sam, turn } } });
        expect((yield* site.summary(id)).people).toEqual([sam]);
      }),
    ),
  );

  it.effect("undo as one step, passing over what the person changed since", () =>
    withSite((site) =>
      Effect.gen(function* () {
        const { id } = yield* site.createDraft(sam, name("Agent edits"));
        yield* site.applyAgentBatch(sam, id, setHeading("Build a boat"), turn);
        yield* site.applyAgentBatch(sam, id, setIntro("Why come"), turn);
        yield* site.applyBatch(sam, id, setIntro("Why you'll love it"));
        expect(yield* site.undoTurn(sam, id, turn)).toEqual({ status: "undone", kept: true });
        const draft = yield* opened(site, id);
        expect(heading(draft)).toBe("Learn by building");
        expect(heading(draft, "b_intro")).toBe("Why you'll love it");
        expect(yield* site.undoTurn(sam, id, turn)).toEqual({ status: "nothing" });
      }),
    ),
  );
});

describe("brand revisions", () => {
  const revision = (number: number, brandColor: `#${string}`): BrandRevision => ({
    ...harbourBrand,
    number,
    theme: resolveTheme({ preset: "editorial", changes: { brandColor } }).theme,
  });
  const liveBrand = (site: Site["Service"], state: PlatformState) =>
    Effect.map(site.live, (live) => state.manifests.get(live.snapshot)?.brand.number);

  it.effect("reach the live site only when the Brand update draft publishes", () =>
    withSite((site, state) =>
      Effect.gen(function* () {
        const update = yield* site.takeBrandRevision(meera, revision(2, "#7a1f5c"));
        if (update._tag !== "Draft") return yield* Effect.die("Expected a Brand update draft.");
        expect(update.draft).toMatchObject({ name: "Brand update", kind: { _tag: "BrandUpdate" } });
        expect((yield* opened(site, update.draft.id)).brand.number).toBe(2);
        expect(yield* liveBrand(site, state)).toBe(1);

        // Another draft keeps the revision it started with.
        const other = yield* site.createDraft(sam, name("Summer copy"));
        expect((yield* opened(site, other.id)).brand.number).toBe(1);

        yield* published(site, update.draft.id, meera);
        expect(yield* liveBrand(site, state)).toBe(2);
        // The other draft takes the revision once it merges what's live.
        expect((yield* opened(site, other.id)).brand.number).toBe(2);
      }),
    ),
  );

  it.effect("move an unpublished Brand update draft rather than making a second", () =>
    withSite((site) =>
      Effect.gen(function* () {
        const first = yield* site.takeBrandRevision(meera, revision(2, "#7a1f5c"));
        const second = yield* site.takeBrandRevision(meera, revision(3, "#1f5c44"));
        if (first._tag !== "Draft" || second._tag !== "Draft")
          return yield* Effect.die("Expected a Brand update draft.");
        expect(second.draft.id).toBe(first.draft.id);
        expect((yield* opened(site, first.draft.id)).brand.number).toBe(3);
        expect(
          (yield* site.drafts).filter((draft) => draft.kind._tag === "BrandUpdate"),
        ).toHaveLength(1);
      }),
    ),
  );

  it.effect("are taken once, and never move a site back to an older one", () =>
    withSite((site, state) =>
      Effect.gen(function* () {
        yield* site.takeBrandRevision(meera, revision(3, "#7a1f5c"));
        expect(yield* site.takeBrandRevision(meera, revision(3, "#7a1f5c"))).toEqual({
          _tag: "Taken",
        });
        expect(yield* site.takeBrandRevision(meera, revision(2, "#1f5c44"))).toEqual({
          _tag: "Taken",
        });
        // The live site already has revision 1.
        expect(yield* site.takeBrandRevision(meera, harbourBrand)).toEqual({ _tag: "Taken" });
        yield* site.deliverOutbox;
        expect(state.delivered.filter((message) => message._tag === "BrandTaken").at(-1)).toEqual({
          _tag: "BrandTaken",
          number: 3,
        });
      }),
    ),
  );

  it.effect(
    "make whoever saved them an editor, who can't approve the update without approving their own",
    () =>
      withSite((site) =>
        Effect.gen(function* () {
          const update = yield* site.takeBrandRevision(meera, revision(2, "#7a1f5c"));
          if (update._tag !== "Draft") return yield* Effect.die("Expected a Brand update draft.");
          const submission = yield* submitted(site, update.draft.id, [
            { name: "Brand team", roles: [], people: [meera], required: 1 },
          ]);
          expect(submission.editedBy).toEqual([meera]);
          const error = yield* Effect.flip(approve(site, approver(meera), submission));
          expect(error._tag).toBe("CannotDecide");
        }),
      ),
  );

  it.effect(
    "come back as a draft when a rollback undoes the Brand update that published them",
    () =>
      withSite((site, state) =>
        Effect.gen(function* () {
          const update = yield* site.takeBrandRevision(meera, revision(2, "#7a1f5c"));
          if (update._tag !== "Draft") return yield* Effect.die("Expected a Brand update draft.");
          yield* published(site, update.draft.id, meera);
          yield* site.rollBack(meera, studio);
          expect(yield* liveBrand(site, state)).toBe(1);
          const [again] = (yield* site.drafts).filter(
            (draft) => draft.status === "open" && draft.kind._tag === "BrandUpdate",
          );
          if (again === undefined) return yield* Effect.die("Expected a Brand update draft.");
          expect((yield* opened(site, again.id)).brand.number).toBe(2);
        }),
      ),
  );

  it.effect(
    "stay in a Brand update draft submitted before them, once that submission publishes",
    () =>
      withSite((site, state) =>
        Effect.gen(function* () {
          const update = yield* site.takeBrandRevision(priya, revision(2, "#7a1f5c"));
          if (update._tag !== "Draft") return yield* Effect.die("Expected a Brand update draft.");
          const submission = yield* submitted(site, update.draft.id);
          yield* site.takeBrandRevision(priya, revision(3, "#1f5c44"));
          yield* approve(site, approver(jonah, ["approver"]), submission);
          yield* approve(site, approver(meera), submission);
          expect(yield* liveBrand(site, state)).toBe(2);
          const draft = yield* opened(site, update.draft.id);
          expect(draft.brand.number).toBe(3);
        }),
      ),
  );
});

describe("block upgrades", () => {
  it.effect("make one draft that moves the live content to the newer version", () =>
    withSite((site, state) =>
      Effect.gen(function* () {
        const adopted = yield* site.adoptUpgrade(meera, BlockType.make("hero"), 3);
        if (Option.isNone(adopted)) return yield* Effect.die("Expected an upgrade draft.");
        expect(adopted.value).toMatchObject({
          name: "Hero v3 upgrade",
          kind: { _tag: "BlockUpgrade", type: "hero", version: 3 },
        });
        const draft = yield* opened(site, adopted.value.id);
        expect(draft.lockfile["hero"]).toBe(3);
        expect(draft.pages[PageId.make("pg_home")]?.blocks[BlockId.make("b_hero")]?.props).toEqual({
          heading: "Learn by building",
          image: expect.anything(),
          actions: [],
        });
        // Adopting again finds the same draft; the live site is untouched.
        const again = yield* site.adoptUpgrade(meera, BlockType.make("hero"), 3);
        expect(Option.map(again, (draft) => draft.id)).toEqual(Option.some(adopted.value.id));
        const live = yield* site.live;
        expect(state.manifests.get(live.snapshot)?.lockfile["hero"]).toBe(1);
      }),
    ),
  );

  it.effect("make one draft when the same upgrade is adopted twice at once", () =>
    withSite((site) =>
      Effect.gen(function* () {
        const [first, second] = yield* Effect.all(
          [
            site.adoptUpgrade(meera, BlockType.make("hero"), 3),
            site.adoptUpgrade(sam, BlockType.make("hero"), 3),
          ],
          { concurrency: "unbounded" },
        );
        expect(Option.map(first, (draft) => draft.id)).toEqual(
          Option.map(second, (draft) => draft.id),
        );
        expect(
          (yield* site.drafts).filter((draft) => draft.kind._tag === "BlockUpgrade"),
        ).toHaveLength(1);
      }),
    ),
  );

  it.effect("report the versions the live release and open drafts pin, when asked again", () =>
    withSite((site, state) =>
      Effect.gen(function* () {
        const { id } = yield* site.createDraft(sam, name("Summer copy"));
        yield* site.deliverOutbox;
        state.delivered.length = 0;
        yield* site.reportBlocks;
        yield* site.deliverOutbox;
        expect(
          state.delivered.flatMap((message) => (message._tag === "Blocks" ? [message.holder] : [])),
        ).toEqual(["live", id]);
      }),
    ),
  );

  it.effect("aren't made for a version the site already has", () =>
    withSite((site) =>
      Effect.gen(function* () {
        expect(yield* site.adoptUpgrade(meera, BlockType.make("hero"), 1)).toEqual(Option.none());
      }),
    ),
  );
});
