import { loadBlocks } from "@repo/blocks";
import { Draft } from "@repo/contracts/draft";
import { FormDefinition } from "@repo/contracts/form";
import { DraftId, FormId, randomId, ReleaseId, type SiteId, SnapshotId } from "@repo/contracts/ids";
import { type Batch, Op } from "@repo/contracts/ops";
import { PageDocument } from "@repo/contracts/page";
import { SiteParts, SiteSettings } from "@repo/contracts/site";
import { type LiveRelease, Lockfile, type SnapshotManifest } from "@repo/contracts/snapshot";
import type { BatchOutcome } from "@repo/contracts/studio";
import { applyOps, type BlockContracts } from "@repo/domain/document";
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

/**
 * One site's drafts. Batches commit one at a time: each one is applied to the
 * draft held in memory, and only the rows it changed are written.
 */
export class SiteDrafts extends Context.Service<
  SiteDrafts,
  {
    /** The site's draft, as the editor opens it. */
    readonly draft: Effect.Effect<Draft, SqlError.SqlError | Schema.SchemaError>;
    /**
     * Commits a batch for `actor`, or reports why it can't. A batch whose ID
     * was already committed reports its first commit and changes nothing.
     */
    readonly applyBatch: (
      actor: string,
      batch: Batch,
    ) => Effect.Effect<BatchOutcome, SqlError.SqlError | Schema.SchemaError>;
  }
>()("Pakshi/StudioApi/SiteDrafts") {
  static readonly layer = Layer.effect(
    SiteDrafts,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { site, liveSnapshot } = yield* SiteSource;
      const lock = yield* Semaphore.make(1);
      let loaded: { readonly draft: Draft; readonly contracts: BlockContracts } | undefined;

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
      const findBatch = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: Schema.Struct({ revision: Schema.Int }),
        execute: (batch) => sql`select revision from batches where id = ${batch}`,
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
        const contracts = yield* Effect.promise(() => loadBlocks(draft.lockfile));
        loaded = { draft, contracts };
        return loaded;
      });

      const commit = (
        previous: Draft,
        next: Draft,
        record: {
          readonly actor: string;
          readonly batch: Batch;
          readonly inverse: ReadonlyArray<Op>;
        },
      ) =>
        sql.withTransaction(
          Effect.gen(function* () {
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
            yield* sql`insert into batches (id, draft_id, actor, committed_at, revision, ops, inverse)
              values (${record.batch.id}, ${next.id}, ${record.actor}, ${new Date().toISOString()},
                ${next.revision}, ${encode(Ops, record.batch.ops)}, ${encode(Ops, record.inverse)})`;
          }),
        );

      return SiteDrafts.of({
        draft: lock.withPermit(Effect.map(current, ({ draft }) => draft)),
        applyBatch: (actor, batch) =>
          lock.withPermit(
            Effect.gen(function* () {
              const { draft, contracts } = yield* current;
              const committed = yield* findBatch(batch.id);
              if (Option.isSome(committed))
                return { status: "committed", revision: committed.value.revision } as const;
              const result = applyOps(draft, batch.ops, contracts);
              if (!result.ok) return { status: "rejected", errors: result.errors } as const;
              const next: Draft = { ...result.draft, revision: draft.revision + 1 };
              yield* commit(draft, next, { actor, batch, inverse: result.inverse });
              loaded = { draft: next, contracts };
              return { status: "committed", revision: next.revision } as const;
            }),
          ),
      });
    }),
  );
}
