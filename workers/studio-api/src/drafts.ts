import { loadBlocks } from "@repo/blocks";
import { Draft } from "@repo/contracts/draft";
import { FormDefinition } from "@repo/contracts/form";
import {
  BatchId,
  DraftId,
  FormId,
  randomId,
  ReleaseId,
  type SiteId,
  SnapshotId,
} from "@repo/contracts/ids";
import { CatchUp, type Collaborator, type Commit } from "@repo/contracts/live";
import { type Batch, type BatchError, Op } from "@repo/contracts/ops";
import { PageDocument } from "@repo/contracts/page";
import { SiteParts, SiteSettings } from "@repo/contracts/site";
import { type LiveRelease, Lockfile, type SnapshotManifest } from "@repo/contracts/snapshot";
import { type CommitResult, commitBatch, type Writes } from "@repo/domain/commit";
import type { BlockContracts } from "@repo/domain/document";
import { ResolvedTheme } from "@repo/tokens";
import { Context, Effect, Layer, Option, Schema, Semaphore } from "effect";
import { type SqlError, SqlClient, SqlSchema } from "effect/unstable/sql";
import * as Migrator from "effect/unstable/sql/Migrator";

/*
 * A site's drafts in its SiteDoc's SQLite storage. Each draft page is its own
 * row, because a row holds at most 2 MB and a large draft saved as one value
 * wouldn't fit. Until named drafts arrive, a site has one draft.
 */

/** The schema of a SiteDoc's own storage, applied when the object starts. */
export const migrations = Migrator.fromRecord({
  "0001_drafts": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`create table drafts (
      id text primary key,
      base_release text not null,
      base_snapshot text not null,
      revision integer not null,
      settings text not null,
      parts text not null,
      forms text not null,
      lockfile text not null,
      theme text not null
    )`;
    yield* sql`create table draft_pages (
      draft_id text not null references drafts (id),
      page_id text not null,
      document text not null,
      primary key (draft_id, page_id)
    )`;
    // Every committed batch, by the ID its sender made, so a batch sent twice
    // is recognised. It's also the draft's history: who changed what, and how
    // to undo it.
    yield* sql`create table batches (
      id text primary key,
      draft_id text not null references drafts (id),
      actor text not null,
      committed_at text not null,
      revision integer not null,
      ops text not null,
      inverse text not null
    )`;
  }),
  "0002_live_editing": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    // The name the actor had, so people who catch up later see who made a change.
    yield* sql`alter table batches add column actor_name text not null default ''`;
    yield* sql`create index batches_by_revision on batches (draft_id, revision)`;
    // Who last wrote each part of a draft, keyed as the document module keys parts.
    yield* sql`create table writes (
      draft_id text not null references drafts (id),
      key text not null,
      actor text not null,
      revision integer not null,
      primary key (draft_id, key)
    )`;
  }),
});

const json = Schema.fromJsonString;

const Forms = Schema.Record(FormId, FormDefinition);

const DraftRow = Schema.Struct({
  id: DraftId,
  base_release: ReleaseId,
  base_snapshot: SnapshotId,
  revision: Schema.Int,
  settings: json(SiteSettings),
  parts: json(SiteParts),
  forms: json(Forms),
  lockfile: json(Lockfile),
  theme: json(ResolvedTheme),
});

const PageRow = Schema.Struct({ document: json(PageDocument) });

const Ops = Schema.Array(Op);

const WriteRow = Schema.Struct({ key: Schema.String, actor: Schema.String, revision: Schema.Int });

const BatchRow = Schema.Struct({
  id: BatchId,
  revision: Schema.Int,
  actor: Schema.String,
  actor_name: Schema.String,
  ops: json(Ops),
});

/** How many batches an editor may be behind before it's sent the whole draft instead. */
const catchUpLimit = 500;

/** A value as the JSON text its column stores. Values here are already typed, so encoding can't fail. */
const encode = <S extends Schema.Top & { readonly EncodingServices: never }>(
  schema: S,
  value: S["Type"],
) => Schema.encodeSync(json(schema))(value);

/** The live release a new draft starts from, with its snapshot and every page in it. */
export interface LiveSnapshot {
  readonly live: LiveRelease;
  readonly manifest: SnapshotManifest;
  readonly pages: ReadonlyArray<PageDocument>;
}

/** Which site a SiteDoc holds, and how to read its live release when a draft starts from it. */
export class SiteSource extends Context.Service<
  SiteSource,
  { readonly site: SiteId; readonly liveSnapshot: Effect.Effect<LiveSnapshot> }
>()("Pakshi/StudioApi/SiteSource") {}

/** What became of a batch SiteDoc was sent. */
export type BatchResult =
  | { readonly status: "committed"; readonly commit: Commit }
  /** The batch was committed before, when it first arrived, at this revision. */
  | { readonly status: "duplicate"; readonly revision: number }
  | { readonly status: "rejected"; readonly errors: ReadonlyArray<BatchError> };

type StorageError = SqlError.SqlError | Schema.SchemaError;

/**
 * One site's drafts. Batches commit one at a time: each one is applied to the
 * draft held in memory, and only the rows it changed are written.
 */
export class SiteDrafts extends Context.Service<
  SiteDrafts,
  {
    /** The site's draft, as the editor opens it. */
    readonly draft: Effect.Effect<Draft, StorageError>;
    /** What an editor at `revision` is missing: the batches since, or the whole draft. */
    readonly catchUp: (revision: number) => Effect.Effect<CatchUp, StorageError>;
    /**
     * Commits a batch for `actor`, or reports why it can't. A batch whose ID
     * was already committed changes nothing.
     */
    readonly applyBatch: (
      actor: Collaborator,
      batch: Batch,
    ) => Effect.Effect<BatchResult, StorageError>;
  }
>()("Pakshi/StudioApi/SiteDrafts") {
  static readonly layer = Layer.effect(
    SiteDrafts,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { site, liveSnapshot } = yield* SiteSource;
      const lock = yield* Semaphore.make(1);
      let loaded:
        | {
            readonly draft: Draft;
            readonly writes: Writes;
            readonly contracts: BlockContracts;
          }
        | undefined;

      const findDraft = SqlSchema.findOneOption({
        Request: Schema.Void,
        Result: DraftRow,
        execute: () => sql`select * from drafts limit 1`,
      });
      const findPages = SqlSchema.findAll({
        Request: DraftId,
        Result: PageRow,
        execute: (draft) => sql`select document from draft_pages where draft_id = ${draft}`,
      });
      const findWrites = SqlSchema.findAll({
        Request: DraftId,
        Result: WriteRow,
        execute: (draft) => sql`select key, actor, revision from writes where draft_id = ${draft}`,
      });
      const findBatch = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: Schema.Struct({ revision: Schema.Int }),
        execute: (batch) => sql`select revision from batches where id = ${batch}`,
      });
      const findBatchesSince = SqlSchema.findAll({
        Request: Schema.Struct({ draft: DraftId, revision: Schema.Int }),
        Result: BatchRow,
        execute: ({ draft, revision }) => sql`
          select id, revision, actor, actor_name, ops from batches
          where draft_id = ${draft} and revision > ${revision}
          order by revision limit ${catchUpLimit + 1}`,
      });

      const writePage = (draft: DraftId, page: PageDocument) =>
        sql`insert into draft_pages (draft_id, page_id, document)
          values (${draft}, ${page.id}, ${encode(PageDocument, page)})
          on conflict (draft_id, page_id) do update set document = excluded.document`;

      const readDraft = Effect.gen(function* () {
        const row = yield* findDraft(undefined);
        if (Option.isNone(row)) return Option.none<Draft>();
        const pages = yield* findPages(row.value.id);
        return Option.some<Draft>({
          id: row.value.id,
          site,
          base: { release: row.value.base_release, snapshot: row.value.base_snapshot },
          revision: row.value.revision,
          settings: row.value.settings,
          parts: row.value.parts,
          forms: row.value.forms,
          lockfile: row.value.lockfile,
          theme: row.value.theme,
          pages: Object.fromEntries(pages.map(({ document }) => [document.id, document])),
        });
      });

      const createDraft = Effect.gen(function* () {
        const { live, manifest, pages } = yield* liveSnapshot;
        const draft: Draft = {
          id: DraftId.make(randomId("dr")),
          site,
          base: live,
          revision: 0,
          settings: manifest.settings,
          parts: manifest.parts,
          forms: manifest.forms,
          lockfile: manifest.lockfile,
          theme: manifest.theme,
          pages: Object.fromEntries(pages.map((page) => [page.id, page])),
        };
        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`insert into drafts
              (id, base_release, base_snapshot, revision, settings, parts, forms, lockfile, theme)
              values (${draft.id}, ${live.release}, ${live.snapshot}, 0,
                ${encode(SiteSettings, draft.settings)}, ${encode(SiteParts, draft.parts)},
                ${encode(Forms, draft.forms)},
                ${encode(Lockfile, draft.lockfile)}, ${encode(ResolvedTheme, draft.theme)})`;
            for (const page of pages) yield* writePage(draft.id, page);
          }),
        );
        return draft;
      });

      /** The draft, loaded once and then kept in memory; the first open starts it from the live release. */
      const current = Effect.gen(function* () {
        if (loaded !== undefined) return loaded;
        const existing = yield* readDraft;
        const draft = Option.isSome(existing) ? existing.value : yield* createDraft;
        const writes = new Map(
          (yield* findWrites(draft.id)).map((row) => [
            row.key,
            { actor: row.actor, revision: row.revision },
          ]),
        );
        const contracts = yield* Effect.promise(() => loadBlocks(draft.lockfile));
        loaded = { draft, writes, contracts };
        return loaded;
      });

      const store = (
        previous: Draft,
        committed: Extract<CommitResult, { ok: true }>,
        actor: Collaborator,
        batch: Batch,
      ) =>
        sql.withTransaction(
          Effect.gen(function* () {
            const next = committed.draft;
            yield* sql`update drafts set
              revision = ${next.revision},
              settings = ${encode(SiteSettings, next.settings)},
              parts = ${encode(SiteParts, next.parts)},
              forms = ${encode(Forms, next.forms)}
              where id = ${next.id}`;
            for (const page of Object.values(next.pages))
              if (previous.pages[page.id] !== page) yield* writePage(next.id, page);
            for (const id of Object.keys(previous.pages))
              if (!(id in next.pages))
                yield* sql`delete from draft_pages where draft_id = ${next.id} and page_id = ${id}`;
            for (const [key, write] of committed.writesChange.set)
              yield* sql`insert into writes (draft_id, key, actor, revision)
                values (${next.id}, ${key}, ${write.actor}, ${write.revision})
                on conflict (draft_id, key) do update
                set actor = excluded.actor, revision = excluded.revision`;
            for (const key of committed.writesChange.removed)
              yield* sql`delete from writes where draft_id = ${next.id} and key = ${key}`;
            yield* sql`insert into batches
              (id, draft_id, actor, actor_name, committed_at, revision, ops, inverse)
              values (${batch.id}, ${next.id}, ${actor.id}, ${actor.name},
                ${new Date().toISOString()}, ${next.revision},
                ${encode(Ops, committed.ops)}, ${encode(Ops, committed.inverse)})`;
          }),
        );

      return SiteDrafts.of({
        draft: lock.withPermit(Effect.map(current, ({ draft }) => draft)),
        catchUp: (revision) =>
          lock.withPermit(
            Effect.gen(function* () {
              const { draft } = yield* current;
              if (revision > draft.revision) return CatchUp.cases.Draft.make({ draft });
              const rows = yield* findBatchesSince({ draft: draft.id, revision });
              if (rows.length > catchUpLimit) return CatchUp.cases.Draft.make({ draft });
              return CatchUp.cases.Batches.make({
                batches: rows.map((row) => ({
                  id: row.id,
                  revision: row.revision,
                  actor: { id: row.actor, name: row.actor_name },
                  ops: row.ops,
                })),
              });
            }),
          ),
        applyBatch: (actor, batch) =>
          lock.withPermit(
            Effect.gen(function* (): Effect.fn.Return<BatchResult, StorageError> {
              const { draft, writes, contracts } = yield* current;
              const earlier = yield* findBatch(batch.id);
              if (Option.isSome(earlier))
                return { status: "duplicate", revision: earlier.value.revision };
              const committed = commitBatch(draft, writes, actor.id, batch, contracts);
              if (!committed.ok) return { status: "rejected", errors: committed.errors };
              yield* store(draft, committed, actor, batch);
              loaded = { draft: committed.draft, writes: committed.writes, contracts };
              return {
                status: "committed",
                commit: {
                  batch: {
                    id: batch.id,
                    revision: committed.draft.revision,
                    actor,
                    ops: committed.ops,
                  },
                  skipped: committed.skipped,
                  replaced: committed.replaced.map(({ actor: person, op }) => ({ person, op })),
                },
              };
            }),
          ),
      });
    }),
  );
}
