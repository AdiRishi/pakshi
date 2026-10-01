import {
  latestLockfile,
  loadBlock,
  loadBlocks,
  loadBlockVersions,
  removedBlockVersions,
  withNewBlockTypes,
} from "@repo/blocks";
import type { BrandRevision } from "@repo/contracts/brand";
import { type Draft, type DraftName, isBehind, type SiteContent } from "@repo/contracts/draft";
import {
  BatchId,
  BlockId,
  type BlockType,
  type DraftId,
  PageId,
  randomId,
  ReleaseId,
  SnapshotId,
  SubmissionId,
  type TurnId,
} from "@repo/contracts/ids";
import { type CatchUp, type Collaborator, ServerMessage } from "@repo/contracts/live";
import type { Conflict, MergedChange, Resolutions } from "@repo/contracts/merge";
import type { Batch } from "@repo/contracts/ops";
import { type BlockInstance, PageDocument, type PagePath } from "@repo/contracts/page";
import type { PreflightIssue } from "@repo/contracts/publishing";
import { liveReleaseOf, now, Release } from "@repo/contracts/release";
import type { DraftSharing, ShareAccess } from "@repo/contracts/sharing";
import type { SiteSettings } from "@repo/contracts/site";
import {
  contentHash,
  type LiveRelease,
  type PageListing,
  type SnapshotManifest,
} from "@repo/contracts/snapshot";
import {
  BlocksRemoved,
  CannotDecide,
  type Decision,
  DecisionOutcome,
  DraftNotFound,
  type DraftSummary,
  NothingToRollBack,
  type PageSummary,
  ReviewPage,
  type SiteView,
  type SubmissionNotFound,
  SubmitOutcome,
  UpdateOutcome,
} from "@repo/contracts/studio";
import { currentStep, type Submission } from "@repo/contracts/submission";
import type { Workflow } from "@repo/contracts/workflow";
import { type Approver, eligibility } from "@repo/domain/approvals";
import type { BlockContracts } from "@repo/domain/document";
import { type Frozen, freeze, shownMedia } from "@repo/domain/freeze";
import {
  changesBetween,
  contractsAt,
  isResolved,
  mergeSites,
  migrateContent,
} from "@repo/domain/merge";
import { rebaseOps } from "@repo/domain/rebase";
import { draftAccess, type Visitor } from "@repo/domain/sharing";
import type { Surface } from "@repo/tokens";
import { Context, Effect, Layer, Option, Schema, Semaphore } from "effect";
import { type SqlError, SqlClient } from "effect/unstable/sql";

import { SiteApprovals, type Stored } from "./approvals.ts";
import {
  type BatchResult,
  byBrand,
  byPerson,
  bySite,
  type DraftInfo,
  type Origin,
  SiteDrafts,
  SiteIdentity,
  turnUndoId,
} from "./drafts.ts";
import { type IndexedRelease, Outbox, type Notification } from "./outbox.ts";
import { LiveUpdates, MediaLibrary, OutboxDelivery, Routing, Snapshots } from "./platform.ts";
import { SiteReleases } from "./releases.ts";

/*
 * A site's drafts, submissions and releases, as SiteDoc runs them. Two turns
 * keep them in order. Every change to storage, and the message that tells
 * people about it, happens in the storage turn, so messages leave in the
 * order changes are made. Anything that changes a submission or the live
 * release also holds the release turn throughout: submitting, deciding,
 * publishing, rolling back, updating and closing a draft happen one after
 * another, while the storage turn is free for edits during their slow reads
 * and writes of R2.
 */

type StorageError = SqlError.SqlError | Schema.SchemaError;

/** A behind draft's merge, as it stands with the sides chosen so far. */
export interface UpdatePreview {
  readonly from: Release;
  readonly to: Release;
  readonly conflicts: ReadonlyArray<Conflict>;
  readonly changes: ReadonlyArray<MergedChange>;
}

/**
 * What undoing an agent's turn did: undid it, keeping any part someone had
 * changed since, or found nothing left to undo, because it committed nothing
 * or was undone already.
 */
export type TurnUndo =
  | { readonly status: "undone"; readonly kept: boolean }
  | { readonly status: "nothing" };

/** What bringing a brand revision to a site did. */
export type BrandUpdate =
  | { readonly _tag: "Draft"; readonly draft: DraftSummary }
  /** The site already had this revision, or a newer one. */
  | { readonly _tag: "Taken" };

/** A block type the live site pins, and how much of the site uses it. */
export interface BlockInUse {
  readonly type: BlockType;
  readonly version: number;
  /** The pages and posts with the block on them. */
  readonly pages: number;
  /** Whether the site's header or footer is this block. */
  readonly sitewide: boolean;
}

/** An open draft, and how the drafts list sums it up. */
export interface DraftView {
  readonly draft: Draft;
  readonly summary: DraftSummary;
}

export type Opened =
  | { readonly _tag: "Ready"; readonly draft: Draft; readonly summary: DraftSummary }
  | { readonly _tag: "NeedsUpdate" };

/** A submission, what it changes compared with the live site, and its pages. */
export interface SubmissionReview {
  readonly submission: Submission;
  readonly changes: ReadonlyArray<MergedChange>;
  readonly pages: ReadonlyArray<PageSummary>;
}

const encodePage = Schema.encodeSync(PageDocument);

/** How many snapshots' content a SiteDoc keeps in memory. */
const keptSnapshots = 4;

const releaseOf = (indexed: IndexedRelease) => indexed.release;

/** A page as the page list shows it, from a draft's page or a manifest's entry. */
const listingOf = (page: PageListing): PageListing =>
  page.type === "post"
    ? { id: page.id, path: page.path, type: page.type, meta: page.meta }
    : { id: page.id, path: page.path, type: page.type, meta: page.meta };

const summaryOf = (page: PageListing): PageSummary => ({
  id: page.id,
  type: page.type,
  path: page.path,
  title: page.meta.title,
});

/** Everyone whose approval counted, once each, in the order they gave it. */
const approversOf = (submission: Submission) =>
  Array.from(
    new Map(submission.approvals.map((approval) => [approval.by.id, approval.by])).values(),
  );

export class Site extends Context.Service<
  Site,
  {
    /**
     * Starts a new site: its first release, with the brand's revision, every
     * block at its newest version, a header, a footer and no pages, and a
     * first draft with an empty home page to build the site in.
     */
    readonly start: (
      by: Collaborator,
      settings: SiteSettings,
      brand: BrandRevision,
    ) => Effect.Effect<DraftSummary, StorageError>;
    /** The release the site serves. */
    readonly live: Effect.Effect<Release, StorageError>;
    /** Every release, newest first. */
    readonly releases: Effect.Effect<ReadonlyArray<Release>, StorageError>;
    readonly drafts: Effect.Effect<ReadonlyArray<DraftSummary>, StorageError>;
    readonly summary: (id: DraftId) => Effect.Effect<DraftSummary, StorageError | DraftNotFound>;
    /** A new draft of what's live. */
    readonly createDraft: (
      by: Collaborator,
      name: DraftName,
    ) => Effect.Effect<DraftSummary, StorageError>;
    readonly renameDraft: (
      id: DraftId,
      name: DraftName,
    ) => Effect.Effect<void, StorageError | DraftNotFound>;
    /**
     * Closes an open draft without publishing it, withdraws its submission
     * under review, and tells everyone in it.
     */
    readonly closeDraft: (
      by: Collaborator,
      id: DraftId,
    ) => Effect.Effect<void, StorageError | DraftNotFound>;
    /** An open draft as it stands, behind or not. */
    readonly view: (id: DraftId) => Effect.Effect<DraftView, StorageError | DraftNotFound>;
    /**
     * An open draft for the editor. A draft that's behind is updated first
     * when its merge is clean; otherwise someone has to settle its conflicts.
     */
    readonly open: (
      by: Collaborator,
      id: DraftId,
    ) => Effect.Effect<Opened, StorageError | DraftNotFound>;
    /** Answers a live connection's sync, in the storage turn, so nothing overtakes the answer. */
    readonly sync: (
      id: DraftId,
      revision: number,
      reply: (catchUp: CatchUp) => Effect.Effect<void>,
    ) => Effect.Effect<void, StorageError | DraftNotFound>;
    /** Commits a person's batch and tells everyone in the draft. */
    readonly applyBatch: (
      actor: Collaborator,
      id: DraftId,
      batch: Batch,
    ) => Effect.Effect<BatchResult, StorageError | DraftNotFound>;
    /**
     * Commits a batch the agent made for `actor` in one turn of their
     * conversation, held to completeness as well as the draft's rules.
     */
    readonly applyAgentBatch: (
      actor: Collaborator,
      id: DraftId,
      batch: Batch,
      turn: TurnId,
    ) => Effect.Effect<BatchResult, StorageError | DraftNotFound>;
    /**
     * Undoes everything an agent's turn committed, except parts someone has
     * changed since. Undoing a turn again changes nothing.
     */
    readonly undoTurn: (
      actor: Collaborator,
      id: DraftId,
      turn: TurnId,
    ) => Effect.Effect<TurnUndo, StorageError | DraftNotFound>;
    readonly previewUpdate: (
      id: DraftId,
      resolutions: Resolutions,
    ) => Effect.Effect<UpdatePreview, StorageError | DraftNotFound>;
    /**
     * Merges the live release into a draft, once every conflict has a side.
     * The sides count only if they were chosen seeing the release still live.
     */
    readonly update: (
      actor: Collaborator,
      id: DraftId,
      resolutions: Resolutions,
      seen: ReleaseId,
    ) => Effect.Effect<UpdateOutcome, StorageError | DraftNotFound>;
    /** What a visitor may do with a draft, going by its sharing. A closed draft allows nothing. */
    readonly access: (
      id: DraftId,
      visitor: Visitor,
    ) => Effect.Effect<ShareAccess | null, StorageError>;
    /** Replaces how an open draft is shared. */
    readonly share: (
      id: DraftId,
      sharing: DraftSharing,
    ) => Effect.Effect<DraftSummary, StorageError | DraftNotFound>;
    /** What pre-flight finds in a draft now, and whether it's behind. */
    readonly check: (id: DraftId) => Effect.Effect<
      {
        readonly issues: ReadonlyArray<PreflightIssue>;
        readonly behind: boolean;
      },
      StorageError | DraftNotFound
    >;
    /**
     * Freezes a draft for approval through a workflow's steps, replacing any
     * submission of it still under review. With no steps, it publishes. A
     * draft that's behind merges first, unless that needs a person.
     * `studio` is Studio's address, for links in the emails it sends.
     */
    readonly submit: (
      actor: Collaborator,
      id: DraftId,
      note: string,
      steps: Workflow,
      studio: string,
    ) => Effect.Effect<SubmitOutcome, StorageError | DraftNotFound>;
    readonly submission: (
      id: SubmissionId,
    ) => Effect.Effect<Submission, StorageError | SubmissionNotFound>;
    /** A submission with what it changes compared with the live site. */
    readonly review: (
      id: SubmissionId,
    ) => Effect.Effect<SubmissionReview, StorageError | SubmissionNotFound>;
    /** A page of an open draft as it stands, for its preview, with the draft's name. */
    readonly draftView: (
      id: DraftId,
      path: PagePath,
    ) => Effect.Effect<
      { readonly name: DraftName; readonly view: SiteView },
      StorageError | DraftNotFound
    >;
    /**
     * A page of a submission, or of the live release beside it, with the
     * blocks the submission changed, while the submission still has the
     * snapshot the reviewer is looking at.
     */
    readonly submissionView: (
      id: SubmissionId,
      snapshot: SnapshotId,
      version: "submitted" | "live",
      path: PagePath,
    ) => Effect.Effect<ReviewPage, StorageError | SubmissionNotFound>;
    /**
     * Approves a submission's current step, or requests changes. `snapshot`
     * is the one the approver saw: a decision on a submission that changed
     * since is refused. The last approval publishes.
     */
    readonly decide: (
      approver: Approver,
      id: SubmissionId,
      snapshot: SnapshotId,
      decision: Decision,
      note: string,
      studio: string,
    ) => Effect.Effect<DecisionOutcome, StorageError | SubmissionNotFound | CannotDecide>;
    /**
     * Makes the release that was live before the latest publish live again,
     * while the registry still holds every block version it pins.
     */
    readonly rollBack: (
      actor: Collaborator,
      studio: string,
    ) => Effect.Effect<Release, StorageError | NothingToRollBack | BlocksRemoved>;
    /**
     * A new draft holding an earlier release's content, to publish through
     * the workflow, while the registry still holds every block version it pins.
     */
    readonly restore: (
      by: Collaborator,
      release: ReleaseId,
      name: DraftName,
    ) => Effect.Effect<Option.Option<DraftSummary>, StorageError | BlocksRemoved>;
    /**
     * Brings a brand revision to the site, once: a Brand update draft moves
     * to it, or one is made from what's live. A site whose live release
     * already has the revision, or a newer one, needs no draft.
     */
    readonly takeBrandRevision: (
      by: Collaborator,
      revision: BrandRevision,
    ) => Effect.Effect<BrandUpdate, StorageError>;
    /**
     * A draft that moves the site's live content to a newer version of one
     * block, migrating it through each version between. A site that already
     * has an open draft for that version gets it back.
     */
    readonly adoptUpgrade: (
      by: Collaborator,
      type: BlockType,
      version: number,
    ) => Effect.Effect<Option.Option<DraftSummary>, StorageError>;
    /** The block versions the live site pins, and where each block is used. */
    readonly blocksInUse: Effect.Effect<ReadonlyArray<BlockInUse>, StorageError>;
    /**
     * Queues D1's copy of the block versions the live release and each open
     * draft pin again, for a site whose copy is missing.
     */
    readonly reportBlocks: Effect.Effect<void, StorageError>;
    /** Writes the live release to KV, and its copy to D1, again. */
    readonly reconcile: Effect.Effect<void, StorageError>;
    /** Whether the outbox holds anything still to deliver. */
    readonly undelivered: Effect.Effect<boolean, StorageError>;
    /** Delivers everything in the outbox, oldest first. */
    readonly deliverOutbox: Effect.Effect<void, StorageError>;
  }
>()("Pakshi/StudioApi/Site") {
  static readonly layer = Layer.effect(
    Site,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { site } = yield* SiteIdentity;
      const drafts = yield* SiteDrafts;
      const releases = yield* SiteReleases;
      const approvals = yield* SiteApprovals;
      const outbox = yield* Outbox;
      const snapshots = yield* Snapshots;
      const routing = yield* Routing;
      const media = yield* MediaLibrary;
      const delivery = yield* OutboxDelivery;
      const live = yield* LiveUpdates;
      const storageTurn = yield* Semaphore.make(1);
      const releaseTurn = yield* Semaphore.make(1);
      const inStorageTurn = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        storageTurn.withPermit(effect);
      const inReleaseTurn = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        releaseTurn.withPermit(effect);

      /** Records that the site has a brand revision, and queues D1's copy of the newest it has. */
      const brandTaken = (number: number) =>
        sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`insert or ignore into brand_revisions (number, taken_at)
              values (${number}, ${now()})`;
            const [newest] = yield* sql<{
              readonly number: number;
            }>`select max(number) as number from brand_revisions`;
            yield* outbox.send({ _tag: "BrandTaken", number: newest?.number ?? number });
          }),
        );

      const newestBrandTaken = Effect.map(
        sql<{ readonly number: number | null }>`select max(number) as number from brand_revisions`,
        ([row]) => row?.number ?? 0,
      );

      // A site whose SiteDoc has recorded nothing yet serves what KV names,
      // such as a seeded snapshot, and SiteDoc takes it from there.
      if (Option.isNone(yield* releases.live)) {
        const served = yield* routing.read;
        if (Option.isSome(served)) {
          const manifest = yield* snapshots.manifest(served.value.snapshot);
          yield* releases.append(
            Release.cases.Imported.make({
              id: served.value.release,
              snapshot: served.value.snapshot,
              at: now(),
            }),
            manifest.lockfile,
          );
          yield* brandTaken(manifest.brand.number);
        }
      }

      const liveRelease = Effect.flatMap(releases.live, (latest) =>
        Option.isSome(latest)
          ? Effect.succeed(releaseOf(latest.value))
          : Effect.die("This site hasn't started, so it has nothing to start a draft from."),
      );

      const contents = new Map<SnapshotId, SiteContent>();
      /**
       * What a snapshot holds, read from R2. Snapshots never change, so the few
       * read last are kept: merges and new drafts read the same ones again.
       */
      const contentOf = Effect.fn("Site.contentOf")(function* (snapshot: SnapshotId) {
        const known = contents.get(snapshot);
        if (known !== undefined) {
          contents.delete(snapshot);
          contents.set(snapshot, known);
          return known;
        }
        const manifest = yield* snapshots.manifest(snapshot);
        const pages = yield* Effect.forEach(manifest.pages, (page) => snapshots.page(page.object), {
          concurrency: "unbounded",
        });
        const content: SiteContent = {
          settings: manifest.settings,
          parts: manifest.parts,
          forms: manifest.forms,
          lockfile: manifest.lockfile,
          brand: manifest.brand,
          pages: Object.fromEntries(pages.map((page) => [page.id, page])),
        };
        contents.set(snapshot, content);
        const [oldest] = contents.keys();
        if (contents.size > keptSnapshots && oldest !== undefined) contents.delete(oldest);
        return content;
      });

      /** Loads every version of each block the contents pin, and the ones between. */
      const libraryFor = (sides: ReadonlyArray<SiteContent>) =>
        Effect.promise(() => loadBlockVersions(sides.map((side) => side.lockfile)));

      const openDraft = Effect.fn("Site.openDraft")(function* (id: DraftId) {
        const info = yield* drafts.summary(id);
        if (info.status !== "open") return yield* new DraftNotFound({ draft: id });
        return yield* drafts.draft(id);
      });

      const withReview = (info: DraftInfo, latest: ReadonlyMap<DraftId, Submission>) => ({
        ...info,
        review: latest.get(info.id) ?? null,
      });

      const summary = Effect.fn("Site.summary")(function* (id: DraftId) {
        const info = yield* drafts.summary(id);
        return withReview(info, yield* approvals.latest);
      });

      /** Commits a batch and tells everyone in the draft. Runs in the storage turn. */
      const commit = Effect.fn("Site.commit")(function* (
        actor: Collaborator,
        id: DraftId,
        batch: Batch,
        origin: Origin,
      ) {
        const result = yield* drafts.commit(actor, id, batch, origin);
        if (result.status === "committed")
          yield* live.send(id, ServerMessage.cases.Committed.make(result.commit));
        return result;
      });

      /** The ops that move a draft onto another release, with content merged to go with it. */
      const moveOnto = (
        actor: Collaborator,
        id: DraftId,
        content: SiteContent,
        onto: LiveRelease,
        contracts: BlockContracts,
      ) =>
        Effect.gen(function* () {
          const draft = yield* drafts.draft(id);
          const batch: Batch = {
            id: BatchId.make(randomId("bat")),
            ops: rebaseOps(draft, content, onto, contracts),
          };
          const result = yield* commit(actor, id, batch, bySite);
          if (result.status !== "committed")
            return yield* Effect.die(`SiteDoc couldn't move ${id} onto ${onto.release}.`);
        });

      /**
       * Merges the live release into a draft with the sides chosen so far.
       * With a committer, it commits the merge as theirs once every conflict
       * has a side. Runs in the release turn, so the live release can't
       * change meanwhile.
       */
      const merge = Effect.fn("Site.merge")(function* (
        id: DraftId,
        resolutions: Resolutions,
        committer: Collaborator | null,
      ) {
        const target = yield* liveRelease;
        const base = (yield* openDraft(id)).base;
        const [from, to] = yield* Effect.all(
          [contentOf(base.snapshot), contentOf(target.snapshot)],
          { concurrency: "unbounded" },
        );
        return yield* inStorageTurn(
          Effect.gen(function* () {
            const draft = yield* drafts.draft(id);
            const library = yield* libraryFor([from, draft, to]);
            const result = mergeSites({ base: from, draft, live: to }, library, resolutions);
            const resolved = isResolved(result, resolutions);
            if (committer !== null && resolved)
              yield* moveOnto(
                committer,
                id,
                result.content,
                liveReleaseOf(target),
                contractsAt(library, result.content.lockfile),
              );
            return { target, result, resolved };
          }),
        );
      });

      /** Brings a behind draft up to date when its merge needs no one. Runs in the release turn. */
      const updateIfClean = Effect.fn("Site.updateIfClean")(function* (
        actor: Collaborator,
        id: DraftId,
      ) {
        const draft = yield* openDraft(id);
        const target = yield* liveRelease;
        if (!isBehind(draft.base, liveReleaseOf(target))) return true;
        const { resolved } = yield* merge(id, {}, actor);
        return resolved;
      });

      /**
       * Live content as a new draft starts from it: with every block type in
       * the library, so new blocks reach sites that started before them.
       */
      const startingContent = (content: SiteContent): SiteContent => ({
        ...content,
        lockfile: withNewBlockTypes(content.lockfile),
      });

      /** Fails when the registry no longer holds a block version the content pins. */
      const keptBlocks = (content: SiteContent) => {
        const removed = removedBlockVersions(content.lockfile);
        return removed.length === 0 ? Effect.void : Effect.fail(new BlocksRemoved({ removed }));
      };

      /**
       * The site's open Brand update draft, moved to a brand revision, or a new
       * one made from what's live. The revision arrives as the brand's own
       * batch, so whoever saved it counts as having edited the draft. Runs in
       * the storage turn.
       */
      const brandUpdateDraft = Effect.fn("Site.brandUpdateDraft")(
        function* (by: Collaborator, revision: BrandRevision, live: Release, content: SiteContent) {
          const open = yield* drafts.openOfKind({ _tag: "BrandUpdate" });
          const info = Option.isSome(open)
            ? open.value
            : yield* drafts.create({
                name: "Brand update",
                kind: { _tag: "BrandUpdate" },
                by,
                base: liveReleaseOf(live),
                content: startingContent(content),
              });
          const draft = yield* drafts.draft(info.id);
          const result = yield* commit(
            by,
            draft.id,
            {
              id: BatchId.make(randomId("bat")),
              ops: [
                {
                  op: "rebase",
                  base: draft.base,
                  lockfile: draft.lockfile,
                  brand: revision,
                  settings: draft.settings,
                  forms: draft.forms,
                  menus: draft.parts.menus,
                },
              ],
            },
            byBrand,
          );
          if (result.status !== "committed")
            return yield* Effect.die(`SiteDoc couldn't move ${draft.id} to a new brand.`);
          return yield* summary(info.id);
          // A draft found open or made in this storage turn is still there.
        },
        Effect.catchTag("DraftNotFound", Effect.die),
      );

      const findRelease = Effect.fn("Site.findRelease")(function* (id: ReleaseId) {
        const history = yield* releases.history;
        return Option.fromNullishOr(history.find((indexed) => indexed.release.id === id)?.release);
      });

      /** Makes a recorded release live in KV, and tells everyone on the site. */
      const goLive = Effect.fn("Site.goLive")(function* (release: Release) {
        yield* live.send(
          null,
          ServerMessage.cases.LiveChanged.make({ live: liveReleaseOf(release) }),
        );
        yield* routing.write(liveReleaseOf(release));
      });

      /** Writes frozen content to R2 as a snapshot, reusing the page objects `previous` already has. */
      const writeSnapshot = Effect.fn("Site.writeSnapshot")(function* (
        content: SiteContent,
        frozen: Frozen,
        previous: Pick<SnapshotManifest, "pages">,
      ) {
        const files = yield* media.files(frozen.media);
        const missing = frozen.media.filter((id) => !files.has(id));
        if (missing.length > 0)
          return yield* Effect.die(`${missing.join(", ")} aren't in the media library.`);
        const written = new Set(previous.pages.map((page) => page.object));
        const pages = yield* Effect.forEach(
          frozen.pages,
          (page) =>
            Effect.gen(function* () {
              const hash = yield* Effect.promise(() => contentHash(encodePage(page)));
              if (!written.has(hash)) yield* snapshots.writePage(hash, page);
              return { ...listingOf(page), object: hash };
            }),
          { concurrency: "unbounded" },
        );
        const manifest: SnapshotManifest = {
          schema: "pakshi.snapshot/1",
          id: SnapshotId.make(randomId("snap")),
          site,
          settings: content.settings,
          parts: content.parts,
          forms: content.forms,
          lockfile: content.lockfile,
          brand: content.brand,
          media: Object.fromEntries(files),
          pages,
          gone: frozen.gone,
        };
        yield* snapshots.writeManifest(manifest);
        return manifest;
      });

      /** Records a change to a submission, with the notification it calls for, in one transaction. */
      const recordSubmission = (
        stored: Stored,
        notification: Notification | null,
        studio: string,
      ) =>
        sql.withTransaction(
          Effect.gen(function* () {
            yield* approvals.record(stored);
            if (notification !== null)
              yield* outbox.send({
                _tag: "Notify",
                notification,
                submission: stored.submission,
                studio,
              });
          }),
        );

      /**
       * A submission merged with a release that went live during its review,
       * with the merged snapshot written, or null when the merge needs a
       * person. A merge that leaves anything for pre-flight to find needs one
       * too. Runs in the release turn.
       */
      const mergeSubmission = Effect.fn("Site.mergeSubmission")(function* (
        stored: Stored,
        target: Release,
      ) {
        const submission = stored.submission;
        const [base, submitted, current] = yield* Effect.all(
          [
            contentOf(submission.base.snapshot),
            contentOf(submission.snapshot),
            contentOf(target.snapshot),
          ],
          { concurrency: "unbounded" },
        );
        const library = yield* libraryFor([base, submitted, current]);
        const result = mergeSites({ base, draft: submitted, live: current }, library, {});
        if (result.conflicts.length > 0) return null;
        const previous = yield* snapshots.manifest(target.snapshot);
        const frozen = freeze(
          result.content,
          contractsAt(library, result.content.lockfile),
          previous,
        );
        if (!frozen.ok) return null;
        const manifest = yield* writeSnapshot(result.content, frozen.frozen, previous);
        contents.set(manifest.id, result.content);
        return {
          ...stored,
          submission: { ...submission, snapshot: manifest.id, base: liveReleaseOf(target) },
        } satisfies Stored;
      });

      /** Sends a submission back to its draft, whose update needs a person. */
      const needsUpdate = (stored: Stored, studio: string) => {
        const submission: Submission = {
          ...stored.submission,
          status: { _tag: "NeedsUpdate", at: now() },
        };
        return Effect.as(
          inStorageTurn(
            recordSubmission({ ...stored, submission }, { _tag: "NeedsUpdate" }, studio),
          ),
          submission,
        );
      };

      /**
       * Merges every submission under review that isn't based on the live
       * release. A clean merge keeps its approvals; one that needs a person
       * sends the submission back to its draft. Runs in the release turn.
       */
      const mergeUnderReview = Effect.fn("Site.mergeUnderReview")(function* (studio: string) {
        const target = yield* liveRelease;
        for (const stored of yield* approvals.inReview) {
          if (stored.submission.base.release === target.id) continue;
          const merged = yield* mergeSubmission(stored, target);
          if (merged === null) yield* needsUpdate(stored, studio);
          else yield* inStorageTurn(recordSubmission(merged, null, studio));
        }
      });

      /**
       * Makes an approved submission live. Its draft closes, unless someone
       * edited it after submitting: then it stays open with those edits,
       * merged onto the new release against what was frozen, so they're all
       * that stays. Runs in the release turn, with the submission based on
       * the live release.
       */
      const publishSubmission = Effect.fn("Site.publishSubmission")(function* (
        actor: Collaborator,
        stored: Stored,
        studio: string,
      ) {
        const submission = stored.submission;
        const id = submission.draft.id;
        const release = Release.cases.Published.make({
          id: ReleaseId.make(randomId("rel")),
          snapshot: submission.snapshot,
          at: now(),
          by: actor,
          draft: submission.draft,
          submittedBy: submission.submittedBy,
          approvedBy: approversOf(submission),
        });
        const [frozen, published] = yield* Effect.all(
          [contentOf(stored.frozen), contentOf(submission.snapshot)],
          { concurrency: "unbounded" },
        );
        yield* inStorageTurn(
          Effect.gen(function* () {
            const edited = yield* drafts.editedSince(id, stored.revision);
            yield* sql.withTransaction(
              Effect.gen(function* () {
                yield* releases.append(release, published.lockfile);
                yield* recordSubmission(
                  {
                    ...stored,
                    submission: {
                      ...submission,
                      status: { _tag: "Published", release: release.id, at: release.at },
                    },
                  },
                  { _tag: "Published" },
                  studio,
                );
                if (!edited) {
                  yield* drafts.close(id, "published");
                  return;
                }
                const draft = yield* drafts.draft(id);
                const library = yield* libraryFor([frozen, draft, published]);
                const result = mergeSites({ base: frozen, draft, live: published }, library, {});
                // Otherwise the draft stays behind, and someone settles its update.
                if (result.conflicts.length === 0)
                  yield* moveOnto(
                    actor,
                    id,
                    result.content,
                    liveReleaseOf(release),
                    contractsAt(library, result.content.lockfile),
                  );
              }),
            );
            if (!edited)
              yield* live.send(
                id,
                ServerMessage.cases.DraftClosed.make({ by: actor, release: release.id }),
              );
            yield* goLive(release);
          }).pipe(
            // Closing a draft withdraws its submission, so a submission's draft is open.
            Effect.catchTag("DraftNotFound", Effect.die),
          ),
        );
        yield* mergeUnderReview(studio);
        return release;
      });

      /** A page of a snapshot, and what it reads from the rest of the site. */
      const snapshotView = Effect.fn("Site.snapshotView")(function* (
        snapshot: SnapshotId,
        path: PagePath,
      ) {
        const manifest = yield* snapshots.manifest(snapshot);
        const entry = manifest.pages.find((page) => page.path === path);
        const page = entry === undefined ? null : yield* snapshots.page(entry.object);
        return {
          settings: manifest.settings,
          parts: manifest.parts,
          forms: manifest.forms,
          lockfile: manifest.lockfile,
          brand: manifest.brand,
          pages: manifest.pages.map(listingOf),
          media: manifest.media,
          page,
        } satisfies SiteView;
      });

      /** The blocks on a page that differ between two versions of a site, on one side of the change. */
      const changedBlocks = (
        changes: ReadonlyArray<MergedChange>,
        page: PageId | undefined,
        side: "submitted" | "live",
      ) =>
        changes.flatMap((change) => {
          if (change.place.target !== page) return [];
          switch (change._tag) {
            case "BlockAdded":
            case "BlockMoved":
              return side === "submitted" ? [change.block.id] : [];
            case "BlockRemoved":
              return side === "live" ? [change.block.id] : [];
            case "ValueChanged":
              return change.block === null ? [] : [change.block.id];
            case "PageAdded":
            case "PageRemoved":
              return [];
          }
        });

      /** What a submission changes compared with the live site. */
      const changesOf = Effect.fn("Site.changesOf")(function* (submission: Submission) {
        const target = yield* liveRelease;
        const [current, submitted] = yield* Effect.all(
          [contentOf(target.snapshot), contentOf(submission.snapshot)],
          { concurrency: "unbounded" },
        );
        return changesBetween(current, submitted, yield* libraryFor([current, submitted]));
      });

      const decisionOn = Effect.fn("Site.decisionOn")(function* (
        approver: Approver,
        id: SubmissionId,
        snapshot: SnapshotId,
        decision: Decision,
        note: string,
        studio: string,
      ): Effect.fn.Return<DecisionOutcome, StorageError | SubmissionNotFound | CannotDecide> {
        const stored = yield* approvals.get(id);
        const submission = stored.submission;
        if (submission.status._tag !== "InReview")
          return DecisionOutcome.cases.Closed.make({ submission });
        if (submission.snapshot !== snapshot)
          return DecisionOutcome.cases.Stale.make({ submission });
        const allowed = eligibility(submission, approver);
        if (!allowed.ok) return yield* new CannotDecide({ reason: allowed.reason });
        const at = now();
        if (decision === "request-changes") {
          const returned: Submission = {
            ...submission,
            status: { _tag: "ChangesRequested", by: approver.person, at, note },
          };
          yield* inStorageTurn(
            recordSubmission(
              { ...stored, submission: returned },
              { _tag: "ChangesRequested" },
              studio,
            ),
          );
          return DecisionOutcome.cases.Recorded.make({ submission: returned });
        }
        const approved: Stored = {
          ...stored,
          submission: {
            ...submission,
            approvals: [
              ...submission.approvals,
              { step: allowed.step, by: approver.person, at, note },
            ],
          },
        };
        const next = currentStep(approved.submission);
        if (next !== null) {
          yield* inStorageTurn(
            recordSubmission(
              approved,
              next === allowed.step ? null : { _tag: "StepStarted" },
              studio,
            ),
          );
          return DecisionOutcome.cases.Recorded.make({ submission: approved.submission });
        }
        // The last approval. A release that went live since merges in first.
        const target = yield* liveRelease;
        const ready =
          approved.submission.base.release === target.id
            ? approved
            : yield* mergeSubmission(approved, target);
        if (ready === null)
          return DecisionOutcome.cases.Recorded.make({
            submission: yield* needsUpdate(approved, studio),
          });
        const release = yield* publishSubmission(approver.person, ready, studio);
        return DecisionOutcome.cases.Published.make({ release });
      });

      return Site.of({
        start: (by, settings, brand) =>
          inReleaseTurn(
            Effect.gen(function* () {
              if (Option.isSome(yield* releases.live))
                return yield* Effect.die(`${site} has started already.`);
              const lockfile = latestLockfile;
              const contracts = yield* Effect.promise(() => loadBlocks(lockfile));
              const part = (placement: "header" | "footer", surface: Surface) => {
                const contract = Array.from(contracts.values()).find(
                  (candidate) => candidate.placement === placement,
                );
                if (contract === undefined || contract.placement === "item")
                  throw new Error(`The library has no ${placement} block.`);
                const [variant] = contract.variants;
                const chosen = contract.surfaces.includes(surface) ? surface : contract.surfaces[0];
                if (variant === undefined || chosen === undefined)
                  throw new Error(`The ${placement} block has no variant or surface.`);
                return {
                  type: contract.type,
                  variant,
                  surface: chosen,
                  props: {},
                } satisfies BlockInstance;
              };
              const header = BlockId.make(randomId("b"));
              const footer = BlockId.make(randomId("b"));
              const content: SiteContent = {
                settings,
                parts: {
                  header,
                  footer,
                  blocks: {
                    [header]: part("header", "default"),
                    [footer]: part("footer", "muted"),
                  },
                  menus: { main: [], footer: [] },
                },
                forms: {},
                lockfile,
                brand,
                pages: {},
              };
              const manifest = yield* writeSnapshot(
                content,
                { pages: [], gone: [], media: shownMedia(content, contracts) },
                { pages: [] },
              );
              contents.set(manifest.id, content);
              const release = Release.cases.Created.make({
                id: ReleaseId.make(randomId("rel")),
                snapshot: manifest.id,
                at: now(),
                by,
              });
              const home: PageDocument = {
                schema: "pakshi.page/1",
                id: PageId.make(randomId("pg")),
                type: "page",
                path: "/",
                meta: { title: settings.name, description: "" },
                root: [],
                blocks: {},
              };
              return yield* inStorageTurn(
                Effect.gen(function* () {
                  yield* releases.append(release, lockfile);
                  yield* brandTaken(brand.number);
                  yield* routing.write(liveReleaseOf(release));
                  const info = yield* drafts.create({
                    name: "Launch",
                    kind: { _tag: "Edit" },
                    by,
                    base: liveReleaseOf(release),
                    content: { ...content, pages: { [home.id]: home } },
                  });
                  return { ...info, review: null };
                }),
              );
            }),
          ),
        live: liveRelease,
        releases: Effect.map(releases.history, (history) => history.map(releaseOf).toReversed()),
        drafts: Effect.gen(function* () {
          const [infos, latest] = yield* Effect.all([drafts.list, approvals.latest]);
          return infos.map((info) => withReview(info, latest));
        }),
        summary,
        createDraft: Effect.fn("Site.createDraft")(function* (by, name) {
          const base = yield* liveRelease;
          const content = startingContent(yield* contentOf(base.snapshot));
          const info = yield* inStorageTurn(
            drafts.create({ name, kind: { _tag: "Edit" }, by, base: liveReleaseOf(base), content }),
          );
          return { ...info, review: null };
        }),
        renameDraft: (id, name) =>
          inStorageTurn(Effect.andThen(openDraft(id), drafts.rename(id, name))),
        closeDraft: (by, id) =>
          inReleaseTurn(
            inStorageTurn(
              Effect.gen(function* () {
                yield* openDraft(id);
                const at = now();
                yield* sql.withTransaction(
                  Effect.gen(function* () {
                    yield* drafts.close(id, "closed");
                    for (const stored of yield* approvals.inReview)
                      if (stored.submission.draft.id === id)
                        yield* approvals.record({
                          ...stored,
                          submission: {
                            ...stored.submission,
                            status: { _tag: "Withdrawn", by, at },
                          },
                        });
                  }),
                );
                yield* live.send(id, ServerMessage.cases.DraftClosed.make({ by, release: null }));
              }),
            ),
          ),
        view: (id) =>
          inStorageTurn(
            Effect.gen(function* () {
              const draft = yield* openDraft(id);
              return { draft, summary: yield* summary(id) };
            }),
          ),
        open: Effect.fn("Site.open")(function* (by, id) {
          const clean = yield* inReleaseTurn(updateIfClean(by, id));
          if (!clean) return { _tag: "NeedsUpdate" } as const;
          return yield* inStorageTurn(
            Effect.gen(function* () {
              const draft = yield* openDraft(id);
              return { _tag: "Ready", draft, summary: yield* summary(id) } as const;
            }),
          );
        }),
        sync: (id, revision, reply) =>
          inStorageTurn(Effect.flatMap(drafts.catchUp(id, revision), reply)),
        applyBatch: (actor, id, batch) => inStorageTurn(commit(actor, id, batch, byPerson)),
        applyAgentBatch: (actor, id, batch, turn) =>
          inStorageTurn(commit(actor, id, batch, { _tag: "Agent", turn })),
        undoTurn: (actor, id, turn) =>
          inStorageTurn(
            Effect.gen(function* () {
              const ops = yield* drafts.turnInverse(id, turn);
              if (ops.length === 0) return { status: "nothing" } as const;
              const result = yield* commit(
                actor,
                id,
                { id: turnUndoId(turn), ops, undo: true },
                { _tag: "Agent", turn },
              );
              // An undo batch never breaks a rule: it passes over the ops that no longer apply.
              return result.status === "committed"
                ? ({ status: "undone", kept: result.commit.skipped.length > 0 } as const)
                : ({ status: "nothing" } as const);
            }),
          ),
        previewUpdate: (id, resolutions) =>
          inReleaseTurn(
            Effect.gen(function* () {
              const draft = yield* openDraft(id);
              const { target, result } = yield* merge(id, resolutions, null);
              const from = yield* findRelease(draft.base.release);
              if (Option.isNone(from))
                return yield* Effect.die(
                  `${id} starts from ${draft.base.release}, which isn't recorded.`,
                );
              return {
                from: from.value,
                to: target,
                conflicts: result.conflicts,
                changes: result.changes,
              };
            }),
          ),
        update: (actor, id, resolutions, seen) =>
          inReleaseTurn(
            Effect.gen(function* () {
              const draft = yield* openDraft(id);
              const target = yield* liveRelease;
              if (!isBehind(draft.base, liveReleaseOf(target)))
                return UpdateOutcome.cases.Updated.make({});
              // Sides chosen against another release may not mean the same against this one.
              const { result, resolved } = yield* merge(
                id,
                resolutions,
                target.id === seen ? actor : null,
              );
              if (target.id !== seen)
                return UpdateOutcome.cases.Unresolved.make({ conflicts: result.conflicts });
              return resolved
                ? UpdateOutcome.cases.Updated.make({})
                : UpdateOutcome.cases.Unresolved.make({ conflicts: result.conflicts });
            }),
          ),
        access: Effect.fn("Site.access")(function* (id, visitor) {
          const info = yield* Effect.option(drafts.summary(id));
          if (Option.isNone(info) || info.value.status !== "open") return null;
          return draftAccess(info.value.sharing, visitor);
        }),
        share: (id, sharing) =>
          inStorageTurn(
            Effect.gen(function* () {
              yield* openDraft(id);
              yield* drafts.share(id, sharing);
              return yield* summary(id);
            }),
          ),
        check: Effect.fn("Site.check")(function* (id) {
          const target = yield* liveRelease;
          const previous = yield* snapshots.manifest(target.snapshot);
          return yield* inStorageTurn(
            Effect.gen(function* () {
              const draft = yield* openDraft(id);
              const frozen = freeze(draft, yield* drafts.contracts(id), previous);
              return {
                issues: frozen.ok ? [] : frozen.issues,
                behind: isBehind(draft.base, liveReleaseOf(target)),
              };
            }),
          );
        }),
        submit: (actor, id, note, steps, studio) =>
          inReleaseTurn(
            Effect.gen(function* (): Effect.fn.Return<SubmitOutcome, StorageError | DraftNotFound> {
              if (!(yield* updateIfClean(actor, id)))
                return SubmitOutcome.cases.NeedsUpdate.make({});
              const target = yield* liveRelease;
              const previous = yield* snapshots.manifest(target.snapshot);
              const { draft, name, frozen } = yield* inStorageTurn(
                Effect.gen(function* () {
                  const draft = yield* openDraft(id);
                  return {
                    draft,
                    name: (yield* drafts.summary(id)).name,
                    frozen: freeze(draft, yield* drafts.contracts(id), previous),
                  };
                }),
              );
              if (!frozen.ok) return SubmitOutcome.cases.Blocked.make({ issues: frozen.issues });
              // Edits keep arriving while the snapshot is written; they aren't part of it.
              const manifest = yield* writeSnapshot(draft, frozen.frozen, previous);
              contents.set(manifest.id, draft);
              const stored: Stored = {
                submission: {
                  id: SubmissionId.make(randomId("sub")),
                  site,
                  draft: { id, name },
                  snapshot: manifest.id,
                  base: draft.base,
                  submittedBy: actor,
                  submittedAt: now(),
                  editedBy: yield* drafts.editors(id, draft.revision),
                  note,
                  steps,
                  approvals: [],
                  status: { _tag: "InReview" },
                },
                revision: draft.revision,
                frozen: manifest.id,
              };
              yield* inStorageTurn(
                sql.withTransaction(
                  Effect.gen(function* () {
                    for (const earlier of yield* approvals.inReview)
                      if (earlier.submission.draft.id === id)
                        yield* approvals.record({
                          ...earlier,
                          submission: {
                            ...earlier.submission,
                            status: { _tag: "Replaced", at: stored.submission.submittedAt },
                          },
                        });
                    yield* recordSubmission(
                      stored,
                      steps.length > 0 ? { _tag: "StepStarted" } : null,
                      studio,
                    );
                  }),
                ),
              );
              if (steps.length > 0)
                return SubmitOutcome.cases.Submitted.make({ submission: stored.submission });
              const release = yield* publishSubmission(actor, stored, studio);
              return SubmitOutcome.cases.Published.make({ release });
            }),
          ),
        submission: (id) => Effect.map(approvals.get(id), (stored) => stored.submission),
        review: Effect.fn("Site.review")(function* (id) {
          const { submission } = yield* approvals.get(id);
          const manifest = yield* snapshots.manifest(submission.snapshot);
          return {
            submission,
            changes: yield* changesOf(submission),
            pages: manifest.pages.map(summaryOf),
          };
        }),
        draftView: (id, path) =>
          inStorageTurn(
            Effect.gen(function* () {
              const draft = yield* openDraft(id);
              const served = Object.values(draft.pages).filter(
                (page) => page.status !== "unpublished",
              );
              const files = yield* media.files(shownMedia(draft, yield* drafts.contracts(id)));
              const view: SiteView = {
                settings: draft.settings,
                parts: draft.parts,
                forms: draft.forms,
                lockfile: draft.lockfile,
                brand: draft.brand,
                pages: served.map(listingOf),
                media: Object.fromEntries(files),
                page: served.find((page) => page.path === path) ?? null,
              };
              return { name: (yield* drafts.summary(id)).name, view };
            }),
          ),
        submissionView: Effect.fn("Site.submissionView")(function* (id, snapshot, version, path) {
          const { submission } = yield* approvals.get(id);
          if (submission.snapshot !== snapshot) return ReviewPage.cases.Changed.make({});
          const target = yield* liveRelease;
          const view = yield* snapshotView(
            version === "submitted" ? submission.snapshot : target.snapshot,
            path,
          );
          const changes = yield* changesOf(submission);
          return ReviewPage.cases.Page.make({
            view,
            changed: changedBlocks(changes, view.page?.id, version),
          });
        }),
        decide: (approver, id, snapshot, decision, note, studio) =>
          inReleaseTurn(decisionOn(approver, id, snapshot, decision, note, studio)),
        rollBack: (actor, studio) =>
          inReleaseTurn(
            Effect.gen(function* () {
              // Only the release turn adds releases, so the history read here stays the latest.
              const history = yield* releases.history;
              const [before, latest] = history.slice(-2).map(releaseOf);
              if (latest?._tag !== "Published" || before === undefined)
                return yield* new NothingToRollBack({});
              const [content, undone] = yield* Effect.all(
                [contentOf(before.snapshot), contentOf(latest.snapshot)],
                { concurrency: "unbounded" },
              );
              yield* keptBlocks(content);
              const release = Release.cases.RolledBack.make({
                id: ReleaseId.make(randomId("rel")),
                snapshot: before.snapshot,
                at: now(),
                by: actor,
                undid: latest.id,
              });
              yield* inStorageTurn(
                Effect.gen(function* () {
                  yield* releases.append(release, content.lockfile);
                  yield* goLive(release);
                  // Undoing a Brand update takes the site back to an older revision, which a
                  // site only leaves forward, so the newer one comes back as a draft.
                  if (
                    content.brand.number < undone.brand.number &&
                    Option.isNone(yield* drafts.openOfKind({ _tag: "BrandUpdate" }))
                  )
                    yield* brandUpdateDraft(actor, undone.brand, release, content);
                }),
              );
              yield* mergeUnderReview(studio);
              return release;
            }),
          ),
        restore: Effect.fn("Site.restore")(function* (by, id, name) {
          const restored = yield* findRelease(id);
          if (Option.isNone(restored)) return Option.none();
          const base = yield* liveRelease;
          const restoredContent = yield* contentOf(restored.value.snapshot);
          yield* keptBlocks(restoredContent);
          // The live site's brand revision stays: a site never goes back to an older one.
          const current = yield* contentOf(base.snapshot);
          const content = startingContent({ ...restoredContent, brand: current.brand });
          const info = yield* inStorageTurn(
            drafts.create({ name, kind: { _tag: "Edit" }, by, base: liveReleaseOf(base), content }),
          );
          return Option.some({ ...info, review: null });
        }),
        takeBrandRevision: (by, revision) =>
          inReleaseTurn(
            Effect.gen(function* (): Effect.fn.Return<BrandUpdate, StorageError> {
              if ((yield* newestBrandTaken) >= revision.number) return { _tag: "Taken" };
              const base = yield* liveRelease;
              const content = yield* contentOf(base.snapshot);
              return yield* inStorageTurn(
                Effect.gen(function* () {
                  if (content.brand.number >= revision.number) {
                    yield* brandTaken(revision.number);
                    return { _tag: "Taken" } as const;
                  }
                  const draft = yield* brandUpdateDraft(by, revision, base, content);
                  yield* brandTaken(revision.number);
                  return { _tag: "Draft", draft } as const;
                }),
              );
            }),
          ),
        adoptUpgrade: Effect.fn("Site.adoptUpgrade")(function* (by, type, version) {
          const kind = { _tag: "BlockUpgrade", type, version } as const;
          const base = yield* liveRelease;
          const content = yield* contentOf(base.snapshot);
          const current = content.lockfile[type];
          if (current === undefined || current >= version) return Option.none();
          const target = { [type]: version };
          const library = yield* Effect.promise(() =>
            loadBlockVersions([content.lockfile, target]),
          );
          const definition = yield* Effect.promise(() => loadBlock(type, target));
          // Checked and made in one storage turn, so adopting twice at once makes one draft.
          return yield* inStorageTurn(
            Effect.gen(function* () {
              const open = yield* drafts.openOfKind(kind);
              const info = Option.isSome(open)
                ? open.value
                : yield* drafts.create({
                    name: `${definition.title} v${version} upgrade`,
                    kind,
                    by,
                    base: liveReleaseOf(base),
                    content: startingContent(migrateContent(library, content, target)),
                  });
              return Option.some(yield* summary(info.id));
            }),
          ).pipe(
            // The draft was found open or made in this storage turn, so it's still there.
            Effect.catchTag("DraftNotFound", Effect.die),
          );
        }),
        reportBlocks: Effect.gen(function* () {
          const latest = yield* releases.live;
          if (Option.isNone(latest)) return;
          const content = yield* contentOf(latest.value.release.snapshot);
          yield* inStorageTurn(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* outbox.send({ _tag: "Blocks", holder: "live", lockfile: content.lockfile });
                for (const info of yield* drafts.list)
                  if (info.status === "open")
                    yield* outbox.send({
                      _tag: "Blocks",
                      holder: info.id,
                      lockfile: (yield* drafts.draft(info.id)).lockfile,
                    });
              }),
            ),
          ).pipe(
            // The draft was just listed open, and a draft is never removed.
            Effect.catchTag("DraftNotFound", Effect.die),
          );
        }),
        blocksInUse: Effect.gen(function* () {
          const content = yield* contentOf((yield* liveRelease).snapshot);
          const pages = Object.values(content.pages).filter(
            (page) => page.status !== "unpublished",
          );
          const sitewide = new Set(Object.values(content.parts.blocks).map((block) => block.type));
          return Object.entries(content.lockfile).map(([type, version]) => ({
            type,
            version,
            pages: pages.filter((page) =>
              Object.values(page.blocks).some((block) => block.type === type),
            ).length,
            sitewide: sitewide.has(type),
          }));
        }),
        reconcile: inStorageTurn(
          Effect.gen(function* () {
            const latest = yield* releases.live;
            if (Option.isNone(latest)) return;
            yield* routing.write(liveReleaseOf(latest.value.release));
            yield* releases.resend(latest.value);
          }),
        ),
        undelivered: Effect.map(outbox.pending, (rows) => rows.length > 0),
        deliverOutbox: Effect.gen(function* () {
          for (const { id, message } of yield* outbox.pending) {
            yield* delivery.deliver(message);
            yield* outbox.delivered(id);
          }
        }),
      });
    }),
  );
}
