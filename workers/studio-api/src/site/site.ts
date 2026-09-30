import { loadBlockVersions } from "@repo/blocks";
import { type Draft, type DraftName, isBehind, type SiteContent } from "@repo/contracts/draft";
import { BatchId, type DraftId, randomId, ReleaseId, SnapshotId } from "@repo/contracts/ids";
import { type CatchUp, type Collaborator, ServerMessage } from "@repo/contracts/live";
import type { Conflict, MergedChange, Resolutions } from "@repo/contracts/merge";
import type { Batch } from "@repo/contracts/ops";
import { PageDocument } from "@repo/contracts/page";
import { liveReleaseOf, now, Release } from "@repo/contracts/release";
import { contentHash, type LiveRelease, type SnapshotManifest } from "@repo/contracts/snapshot";
import {
  DraftNotFound,
  type DraftSummary,
  NothingToRollBack,
  PublishOutcome,
  UpdateOutcome,
} from "@repo/contracts/studio";
import { freeze } from "@repo/domain/freeze";
import { contractsAt, isResolved, mergeSites } from "@repo/domain/merge";
import { rebaseOps } from "@repo/domain/rebase";
import { Context, Effect, Layer, Option, Schema, Semaphore } from "effect";
import { type SqlError, SqlClient } from "effect/unstable/sql";

import { type BatchResult, SiteDrafts } from "./drafts.ts";
import { LiveUpdates, MediaLibrary, ReleaseIndex, Routing, Snapshots } from "./platform.ts";
import { type IndexedRelease, SiteReleases } from "./releases.ts";

/*
 * A site's drafts and releases, as SiteDoc runs them. Two turns keep them in
 * order. Every change to storage, and the message that tells people about
 * it, happens in the storage turn, so messages leave in the order changes
 * are made. Publishing, rolling back and updating a draft also hold the
 * release turn throughout, so they happen one after another, while the
 * storage turn is free for edits during their slow reads and writes of R2.
 */

type StorageError = SqlError.SqlError | Schema.SchemaError;

/** A behind draft's merge, as it stands with the sides chosen so far. */
export interface UpdatePreview {
  readonly from: Release;
  readonly to: Release;
  readonly conflicts: ReadonlyArray<Conflict>;
  readonly changes: ReadonlyArray<MergedChange>;
}

/** An open draft, and how the drafts list sums it up. */
export interface DraftView {
  readonly draft: Draft;
  readonly summary: DraftSummary;
}

export type Opened =
  | { readonly _tag: "Ready"; readonly draft: Draft; readonly summary: DraftSummary }
  | { readonly _tag: "NeedsUpdate" };

const encodePage = Schema.encodeSync(PageDocument);

/** How many snapshots' content a SiteDoc keeps in memory. */
const keptSnapshots = 4;

const releaseOf = (indexed: IndexedRelease) => indexed.release;

export class Site extends Context.Service<
  Site,
  {
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
    /** Closes an open draft without publishing it, and tells everyone in it. */
    readonly closeDraft: (
      by: Collaborator,
      id: DraftId,
    ) => Effect.Effect<void, StorageError | DraftNotFound>;
    /** An open draft as it stands, behind or not. */
    readonly view: (
      id: DraftId,
    ) => Effect.Effect<
      { readonly draft: Draft; readonly summary: DraftSummary },
      StorageError | DraftNotFound
    >;
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
    readonly previewUpdate: (
      id: DraftId,
      resolutions: Resolutions,
    ) => Effect.Effect<UpdatePreview, StorageError | DraftNotFound>;
    /** Merges the live release into a draft, once every conflict has a side. */
    readonly update: (
      actor: Collaborator,
      id: DraftId,
      resolutions: Resolutions,
    ) => Effect.Effect<UpdateOutcome, StorageError | DraftNotFound>;
    /**
     * Freezes a draft and makes it live. A draft that's behind merges first,
     * unless that needs a person. A draft edited while it was being published
     * stays open with those edits, now starting from the release it became.
     */
    readonly publish: (
      actor: Collaborator,
      id: DraftId,
    ) => Effect.Effect<PublishOutcome, StorageError | DraftNotFound>;
    /** Makes the release that was live before the latest publish live again. */
    readonly rollBack: (
      actor: Collaborator,
    ) => Effect.Effect<Release, StorageError | NothingToRollBack>;
    /** A new draft holding an earlier release's content, to publish through the workflow. */
    readonly restore: (
      by: Collaborator,
      release: ReleaseId,
      name: DraftName,
    ) => Effect.Effect<Option.Option<DraftSummary>, StorageError>;
    /** Writes the live release to KV, and its copy to D1, again. */
    readonly reconcile: Effect.Effect<void, StorageError>;
    /** Whether D1 has release copies still to receive. */
    readonly undelivered: Effect.Effect<boolean, StorageError>;
    /** Sends D1 every release copy it hasn't received. */
    readonly deliverOutbox: Effect.Effect<void, StorageError>;
  }
>()("Pakshi/StudioApi/Site") {
  static readonly layer = Layer.effect(
    Site,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const drafts = yield* SiteDrafts;
      const releases = yield* SiteReleases;
      const snapshots = yield* Snapshots;
      const routing = yield* Routing;
      const media = yield* MediaLibrary;
      const index = yield* ReleaseIndex;
      const live = yield* LiveUpdates;
      const storageTurn = yield* Semaphore.make(1);
      const releaseTurn = yield* Semaphore.make(1);
      const inStorageTurn = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        storageTurn.withPermit(effect);
      const inReleaseTurn = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        releaseTurn.withPermit(effect);

      // A site whose SiteDoc has recorded nothing yet serves what KV names,
      // such as a seeded snapshot, and SiteDoc takes it from there.
      if (Option.isNone(yield* releases.live)) {
        const served = yield* routing.read;
        if (Option.isSome(served))
          yield* releases.append(
            Release.cases.Imported.make({
              id: served.value.release,
              snapshot: served.value.snapshot,
              at: now(),
            }),
          );
      }

      const liveRelease = Effect.flatMap(releases.live, (latest) =>
        Option.isSome(latest)
          ? Effect.succeed(latest.value)
          : Effect.die(
              "This site has never been published, so it has nothing to start a draft from.",
            ),
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
          theme: manifest.theme,
          pages: Object.fromEntries(pages.map((page) => [page.id, page])),
        };
        contents.set(snapshot, content);
        const [oldest] = contents.keys();
        if (contents.size > keptSnapshots && oldest !== undefined) contents.delete(oldest);
        return content;
      });

      const openDraft = Effect.fn("Site.openDraft")(function* (id: DraftId) {
        const summary = yield* drafts.summary(id);
        if (summary.status !== "open") return yield* new DraftNotFound({ draft: id });
        return yield* drafts.draft(id);
      });

      /** Commits a batch and tells everyone in the draft. Runs in the storage turn. */
      const commit = Effect.fn("Site.commit")(function* (
        actor: Collaborator,
        id: DraftId,
        batch: Batch,
        origin: "person" | "site",
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
        contracts: ReturnType<typeof contractsAt>,
      ) =>
        Effect.gen(function* () {
          const draft = yield* drafts.draft(id);
          const batch: Batch = {
            id: BatchId.make(randomId("bat")),
            ops: rebaseOps(draft, content, onto, contracts),
          };
          const result = yield* commit(actor, id, batch, "site");
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
        const target = releaseOf(yield* liveRelease);
        const base = (yield* openDraft(id)).base;
        const [from, to] = yield* Effect.all(
          [contentOf(base.snapshot), contentOf(target.snapshot)],
          {
            concurrency: "unbounded",
          },
        );
        return yield* inStorageTurn(
          Effect.gen(function* () {
            const draft = yield* drafts.draft(id);
            const library = yield* Effect.promise(() =>
              loadBlockVersions([from.lockfile, draft.lockfile, to.lockfile]),
            );
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
        const target = releaseOf(yield* liveRelease);
        if (!isBehind(draft.base, liveReleaseOf(target))) return true;
        const { resolved } = yield* merge(id, {}, actor);
        return resolved;
      });

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

      const writeSnapshot = Effect.fn("Site.writeSnapshot")(function* (
        draft: Draft,
        frozen: Extract<ReturnType<typeof freeze>, { ok: true }>["frozen"],
        previous: SnapshotManifest,
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
              return { page, hash };
            }),
          { concurrency: "unbounded" },
        );
        const manifest: SnapshotManifest = {
          schema: "pakshi.snapshot/1",
          id: SnapshotId.make(randomId("snap")),
          site: draft.site,
          settings: draft.settings,
          parts: draft.parts,
          forms: draft.forms,
          lockfile: draft.lockfile,
          theme: draft.theme,
          media: Object.fromEntries(files),
          pages: pages.map(({ page, hash }) =>
            page.type === "post"
              ? { id: page.id, path: page.path, type: page.type, meta: page.meta, object: hash }
              : { id: page.id, path: page.path, type: page.type, meta: page.meta, object: hash },
          ),
          gone: frozen.gone,
        };
        yield* snapshots.writeManifest(manifest);
        return manifest;
      });

      return Site.of({
        live: Effect.map(liveRelease, releaseOf),
        releases: Effect.map(releases.history, (history) => history.map(releaseOf).toReversed()),
        drafts: drafts.list,
        summary: drafts.summary,
        createDraft: Effect.fn("Site.createDraft")(function* (by, name) {
          const base = releaseOf(yield* liveRelease);
          const content = yield* contentOf(base.snapshot);
          return yield* inStorageTurn(
            drafts.create({ name, by, base: liveReleaseOf(base), content }),
          );
        }),
        renameDraft: (id, name) => inStorageTurn(drafts.rename(id, name)),
        closeDraft: (by, id) =>
          inStorageTurn(
            Effect.gen(function* () {
              yield* openDraft(id);
              yield* drafts.close(id, "closed");
              yield* live.send(id, ServerMessage.cases.DraftClosed.make({ by, release: null }));
            }),
          ),
        view: (id) =>
          inStorageTurn(
            Effect.gen(function* () {
              const draft = yield* openDraft(id);
              return { draft, summary: yield* drafts.summary(id) };
            }),
          ),
        open: Effect.fn("Site.open")(function* (by, id) {
          const clean = yield* inReleaseTurn(updateIfClean(by, id));
          if (!clean) return { _tag: "NeedsUpdate" } as const;
          return yield* inStorageTurn(
            Effect.gen(function* () {
              const draft = yield* openDraft(id);
              return { _tag: "Ready", draft, summary: yield* drafts.summary(id) } as const;
            }),
          );
        }),
        sync: (id, revision, reply) =>
          inStorageTurn(Effect.flatMap(drafts.catchUp(id, revision), reply)),
        applyBatch: (actor, id, batch) => inStorageTurn(commit(actor, id, batch, "person")),
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
        update: (actor, id, resolutions) =>
          inReleaseTurn(
            Effect.gen(function* () {
              const draft = yield* openDraft(id);
              if (!isBehind(draft.base, liveReleaseOf(releaseOf(yield* liveRelease))))
                return UpdateOutcome.cases.Updated.make({});
              const { result, resolved } = yield* merge(id, resolutions, actor);
              return resolved
                ? UpdateOutcome.cases.Updated.make({})
                : UpdateOutcome.cases.Unresolved.make({ conflicts: result.conflicts });
            }),
          ),
        publish: (actor, id) =>
          inReleaseTurn(
            Effect.gen(function* (): Effect.fn.Return<
              PublishOutcome,
              StorageError | DraftNotFound
            > {
              if (!(yield* updateIfClean(actor, id)))
                return PublishOutcome.cases.NeedsUpdate.make({});
              const previous = releaseOf(yield* liveRelease);
              const previousManifest = yield* snapshots.manifest(previous.snapshot);
              const frozen = yield* inStorageTurn(
                Effect.gen(function* () {
                  const draft = yield* openDraft(id);
                  return {
                    draft,
                    result: freeze(draft, yield* drafts.contracts(id), previousManifest),
                  };
                }),
              );
              if (!frozen.result.ok)
                return PublishOutcome.cases.Incomplete.make({
                  incomplete: frozen.result.incomplete,
                });
              // Edits keep arriving while the snapshot is written.
              const manifest = yield* writeSnapshot(
                frozen.draft,
                frozen.result.frozen,
                previousManifest,
              );
              const summary = yield* drafts.summary(id);
              const release = Release.cases.Published.make({
                id: ReleaseId.make(randomId("rel")),
                snapshot: manifest.id,
                at: now(),
                by: actor,
                draft: { id, name: summary.name },
              });
              yield* inStorageTurn(
                Effect.gen(function* () {
                  const edited = (yield* drafts.draft(id)).revision !== frozen.draft.revision;
                  yield* sql.withTransaction(
                    Effect.gen(function* () {
                      yield* releases.append(release);
                      if (!edited) {
                        yield* drafts.close(id, "published");
                        return;
                      }
                      // What was frozen is live now, so only the later edits stay in the draft.
                      const current = yield* drafts.draft(id);
                      yield* moveOnto(
                        actor,
                        id,
                        current,
                        liveReleaseOf(release),
                        yield* drafts.contracts(id),
                      );
                    }),
                  );
                  if (!edited)
                    yield* live.send(
                      id,
                      ServerMessage.cases.DraftClosed.make({ by: actor, release: release.id }),
                    );
                  yield* goLive(release);
                }),
              );
              return PublishOutcome.cases.Published.make({ release });
            }),
          ),
        rollBack: (actor) =>
          inReleaseTurn(
            inStorageTurn(
              Effect.gen(function* () {
                const history = yield* releases.history;
                const [before, latest] = history.slice(-2).map(releaseOf);
                if (latest?._tag !== "Published" || before === undefined)
                  return yield* new NothingToRollBack({});
                const release = Release.cases.RolledBack.make({
                  id: ReleaseId.make(randomId("rel")),
                  snapshot: before.snapshot,
                  at: now(),
                  by: actor,
                  undid: latest.id,
                });
                yield* releases.append(release);
                yield* goLive(release);
                return release;
              }),
            ),
          ),
        restore: Effect.fn("Site.restore")(function* (by, id, name) {
          const restored = yield* findRelease(id);
          if (Option.isNone(restored)) return Option.none();
          const base = releaseOf(yield* liveRelease);
          const content = yield* contentOf(restored.value.snapshot);
          return Option.some(
            yield* inStorageTurn(drafts.create({ name, by, base: liveReleaseOf(base), content })),
          );
        }),
        reconcile: inStorageTurn(
          Effect.gen(function* () {
            const latest = yield* liveRelease;
            yield* routing.write(liveReleaseOf(latest.release));
            yield* releases.resend(latest);
          }),
        ),
        undelivered: Effect.map(releases.outbox, (rows) => rows.length > 0),
        deliverOutbox: Effect.gen(function* () {
          for (const { id, message } of yield* releases.outbox) {
            yield* index.record(message);
            yield* releases.delivered(id);
          }
        }),
      });
    }),
  );
}
