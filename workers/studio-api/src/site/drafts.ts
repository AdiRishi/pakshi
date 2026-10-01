import { loadBlocks } from "@repo/blocks";
import { BrandRevision } from "@repo/contracts/brand";
import { type Draft, DraftName, type SiteContent } from "@repo/contracts/draft";
import { FormDefinition } from "@repo/contracts/form";
import {
  BatchId,
  DraftId,
  FormId,
  randomId,
  ReleaseId,
  type SiteId,
  SnapshotId,
  TurnId,
} from "@repo/contracts/ids";
import { CatchUp, Collaborator, type Commit } from "@repo/contracts/live";
import { type Batch, type BatchError, Op } from "@repo/contracts/ops";
import { PageDocument } from "@repo/contracts/page";
import { now, Timestamp } from "@repo/contracts/release";
import { DraftSharing, unshared } from "@repo/contracts/sharing";
import { SiteParts } from "@repo/contracts/site";
import { type LiveRelease, Lockfile } from "@repo/contracts/snapshot";
import {
  DraftKind,
  DraftNotFound,
  type DraftStatus,
  type DraftSummary,
} from "@repo/contracts/studio";
import { type CommitResult, commitBatch, type Writes } from "@repo/domain/commit";
import type { BlockContracts } from "@repo/domain/document";
import { Context, Effect, Equal, Layer, Option, Schema } from "effect";
import { type SqlError, SqlClient, SqlSchema } from "effect/unstable/sql";

import { Outbox } from "./outbox.ts";

/*
 * A site's drafts in its SiteDoc's SQLite storage. Each draft page is its own
 * row, and every batch committed to a draft is kept, with who wrote each part
 * of it last. Callers take turns: the Site service runs every call here one
 * at a time.
 */

const json = Schema.fromJsonString;

const Forms = Schema.Record(FormId, FormDefinition);

const DraftStatusColumn = Schema.Literals(["open", "published", "closed"]);

const DraftRow = Schema.Struct({
  id: DraftId,
  name: DraftName,
  kind: json(DraftKind),
  status: DraftStatusColumn,
  created_by: json(Collaborator),
  created_at: Timestamp,
  closed_at: Schema.NullOr(Timestamp),
  base_release: ReleaseId,
  base_snapshot: SnapshotId,
  revision: Schema.Int,
  parts: json(SiteParts),
  forms: json(Forms),
  lockfile: json(Lockfile),
  brand: json(BrandRevision),
  sharing: json(DraftSharing),
});
type DraftRow = typeof DraftRow.Type;

const PageRow = Schema.Struct({ document: json(PageDocument) });

const Ops = Schema.Array(Op);

const WriteRow = Schema.Struct({ key: Schema.String, actor: Schema.String, revision: Schema.Int });

const BatchRow = Schema.Struct({
  id: BatchId,
  revision: Schema.Int,
  actor: Schema.String,
  actor_name: Schema.String,
  turn: Schema.NullOr(TurnId),
  ops: json(Ops),
});

const EditorRow = Schema.Struct({
  draft_id: DraftId,
  actor: Schema.String,
  actor_name: Schema.String,
  at: Timestamp,
});

/** A draft as the drafts list sums it up, before its latest submission is added. */
export type DraftInfo = Omit<DraftSummary, "review">;

/** How many batches an editor may be behind before it's sent the whole draft instead. */
const catchUpLimit = 500;

/** A value as the JSON text its column stores. Values here are already typed, so encoding can't fail. */
const encode = <S extends Schema.Top & { readonly EncodingServices: never }>(
  schema: S,
  value: S["Type"],
) => Schema.encodeSync(json(schema))(value);

/** What became of a batch sent to a draft. */
export type BatchResult =
  | { readonly status: "committed"; readonly commit: Commit }
  /** The batch was committed before, when it first arrived, at this revision. */
  | { readonly status: "duplicate"; readonly revision: number }
  | { readonly status: "rejected"; readonly errors: ReadonlyArray<BatchError> };

/**
 * Who a batch comes from: a person, whose batches are held to what people
 * may change; the agent, working for a person in one turn of their
 * conversation; the site itself, merging a release in or publishing; or a
 * brand, moving a Brand update draft to its newer revision.
 */
export type Origin =
  | { readonly _tag: "Person" }
  | { readonly _tag: "Agent"; readonly turn: TurnId }
  | { readonly _tag: "Site" }
  | { readonly _tag: "Brand" };

export const byPerson: Origin = { _tag: "Person" };
export const bySite: Origin = { _tag: "Site" };
export const byBrand: Origin = { _tag: "Brand" };

/**
 * How the batch log records an origin. A brand's batch is an edit, like a
 * person's: it makes whoever saved the revision an editor of the draft, and
 * it's a change a submission hasn't frozen yet. A merge is neither.
 */
const originColumn = (origin: Origin) => {
  switch (origin._tag) {
    case "Site":
      return "site";
    case "Brand":
      return "brand";
    case "Person":
    case "Agent":
      return "person";
  }
};

/**
 * Who the draft's writes record for a batch. The agent's writes belong to
 * its turn rather than to the person it works for, so undoing the turn
 * passes over what the person changed since, as it does for anyone else.
 */
const writer = (actor: Collaborator, origin: Origin) =>
  origin._tag === "Agent" ? `agent:${origin.turn}` : actor.id;

/** The ID of the batch that undoes an agent's turn, the same each time, so undoing a turn twice undoes it once. */
export const turnUndoId = (turn: TurnId) => BatchId.make(`bat_undo${turn.slice("turn_".length)}`);

type StorageError = SqlError.SqlError | Schema.SchemaError;

const rejected = (rule: BatchError["rule"], message: string): BatchResult => ({
  status: "rejected",
  errors: [{ op: 0, path: [], rule, message }],
});

/** A draft held in memory, with who last wrote each part and the block versions it pins. */
interface Loaded {
  readonly draft: Draft;
  readonly writes: Writes;
  readonly contracts: BlockContracts;
}

/** Which site a SiteDoc holds. */
export class SiteIdentity extends Context.Service<SiteIdentity, { readonly site: SiteId }>()(
  "Pakshi/StudioApi/SiteIdentity",
) {}

export class SiteDrafts extends Context.Service<
  SiteDrafts,
  {
    /** Every draft, open ones first, newest first within each. */
    readonly list: Effect.Effect<ReadonlyArray<DraftInfo>, StorageError>;
    readonly summary: (id: DraftId) => Effect.Effect<DraftInfo, StorageError | DraftNotFound>;
    /** A draft as it stands, open or not. */
    readonly draft: (id: DraftId) => Effect.Effect<Draft, StorageError | DraftNotFound>;
    /** The block versions a draft pins. */
    readonly contracts: (
      id: DraftId,
    ) => Effect.Effect<BlockContracts, StorageError | DraftNotFound>;
    /** The open draft of a kind Pakshi makes, if the site has one. */
    readonly openOfKind: (
      kind: Exclude<DraftKind, { readonly _tag: "Edit" }>,
    ) => Effect.Effect<Option.Option<DraftInfo>, StorageError>;
    readonly create: (draft: {
      readonly name: DraftName;
      readonly kind: DraftKind;
      readonly by: Collaborator;
      readonly base: LiveRelease;
      readonly content: SiteContent;
    }) => Effect.Effect<DraftInfo, StorageError>;
    /** What an editor at `revision` is missing: the batches since, or the whole draft. */
    readonly catchUp: (
      id: DraftId,
      revision: number,
    ) => Effect.Effect<CatchUp, StorageError | DraftNotFound>;
    /**
     * Commits a batch to an open draft, or reports why it can't. A batch
     * whose ID was already committed changes nothing.
     */
    readonly commit: (
      actor: Collaborator,
      id: DraftId,
      batch: Batch,
      origin: Origin,
    ) => Effect.Effect<BatchResult, StorageError | DraftNotFound>;
    /** Closes an open draft, published or not. It takes no more batches. */
    readonly close: (
      id: DraftId,
      status: Exclude<DraftStatus, "open">,
    ) => Effect.Effect<void, StorageError | DraftNotFound>;
    readonly rename: (
      id: DraftId,
      name: DraftName,
    ) => Effect.Effect<void, StorageError | DraftNotFound>;
    /** Replaces how a draft is shared, and queues the copy D1 lists shared drafts from. */
    readonly share: (
      id: DraftId,
      sharing: DraftSharing,
    ) => Effect.Effect<void, StorageError | DraftNotFound>;
    /**
     * Everyone who changed the draft up to a revision: with their own batches,
     * or by saving a brand revision the draft moved to.
     */
    readonly editors: (
      id: DraftId,
      revision: number,
    ) => Effect.Effect<ReadonlyArray<Collaborator>, StorageError>;
    /** Whether a person, or a brand's new revision, changed the draft after a revision. */
    readonly editedSince: (id: DraftId, revision: number) => Effect.Effect<boolean, StorageError>;
    /** The ops that undo what an agent's turn committed to a draft, in the order to apply them. */
    readonly turnInverse: (
      id: DraftId,
      turn: TurnId,
    ) => Effect.Effect<ReadonlyArray<Op>, StorageError>;
  }
>()("Pakshi/StudioApi/SiteDrafts") {
  static readonly layer = Layer.effect(
    SiteDrafts,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const outbox = yield* Outbox;
      const { site } = yield* SiteIdentity;
      const loaded = new Map<DraftId, Loaded>();

      const findDraft = SqlSchema.findOneOption({
        Request: DraftId,
        Result: DraftRow,
        execute: (id) => sql`select * from drafts where id = ${id}`,
      });
      const findDrafts = SqlSchema.findAll({
        Request: Schema.Void,
        Result: DraftRow,
        execute: () => sql`select * from drafts
          order by status = 'open' desc, coalesce(closed_at, created_at) desc`,
      });
      const findEditors = SqlSchema.findAll({
        Request: Schema.Void,
        Result: EditorRow,
        execute: () => sql`
          select draft_id, actor, actor_name, max(committed_at) as at from batches
          group by draft_id, actor, actor_name order by at desc`,
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
          select id, revision, actor, actor_name, turn, ops from batches
          where draft_id = ${draft} and revision > ${revision}
          order by revision limit ${catchUpLimit + 1}`,
      });

      const findTurnInverses = SqlSchema.findAll({
        Request: Schema.Struct({ draft: DraftId, turn: TurnId, undo: BatchId }),
        Result: Schema.Struct({ inverse: json(Ops) }),
        execute: ({ draft, turn, undo }) => sql`
          select inverse from batches
          where draft_id = ${draft} and turn = ${turn} and id != ${undo}
          order by revision desc`,
      });

      const findEditorsUpTo = SqlSchema.findAll({
        Request: Schema.Struct({ draft: DraftId, revision: Schema.Int }),
        Result: Collaborator,
        execute: ({ draft, revision }) => sql`
          select actor as id, actor_name as name from batches
          where draft_id = ${draft} and origin in ('person', 'brand') and revision <= ${revision}
          group by actor order by min(revision)`,
      });
      const findEditedSince = SqlSchema.findOneOption({
        Request: Schema.Struct({ draft: DraftId, revision: Schema.Int }),
        Result: Schema.Struct({ revision: Schema.Int }),
        execute: ({ draft, revision }) => sql`
          select revision from batches
          where draft_id = ${draft} and origin in ('person', 'brand') and revision > ${revision}
          limit 1`,
      });

      /** The people a draft is shared with, for D1's list; none once it's closed. */
      const sendShares = (id: DraftId, name: DraftName, sharing: DraftSharing | null) =>
        outbox.send({
          _tag: "Shares",
          draft: id,
          name,
          people: (sharing?.people ?? []).map(({ person, access }) => ({ id: person.id, access })),
        });

      /** The block versions an open draft pins, or with null, that it's closed, for D1's copy. */
      const sendBlocks = (id: DraftId, lockfile: Lockfile | null) =>
        outbox.send({ _tag: "Blocks", holder: id, lockfile });

      const summaryOf = (
        row: DraftRow,
        editors: ReadonlyArray<typeof EditorRow.Type>,
      ): DraftInfo => {
        const people = editors.filter((editor) => editor.draft_id === row.id);
        const [latest] = people;
        return {
          id: row.id,
          name: row.name,
          kind: row.kind,
          status: row.status,
          base: { release: row.base_release, snapshot: row.base_snapshot },
          createdBy: row.created_by,
          createdAt: row.created_at,
          lastEdit:
            latest === undefined
              ? null
              : { by: { id: latest.actor, name: latest.actor_name }, at: latest.at },
          people: people.map((editor) => ({ id: editor.actor, name: editor.actor_name })),
          closedAt: row.closed_at,
          sharing: row.sharing,
        };
      };

      const rowOf = Effect.fn("SiteDrafts.rowOf")(function* (id: DraftId) {
        const row = yield* findDraft(id);
        if (Option.isNone(row)) return yield* new DraftNotFound({ draft: id });
        return row.value;
      });

      const writePage = (draft: DraftId, page: PageDocument) =>
        sql`insert into draft_pages (draft_id, page_id, document)
          values (${draft}, ${page.id}, ${encode(PageDocument, page)})
          on conflict (draft_id, page_id) do update set document = excluded.document`;

      /** A draft, loaded once and then kept in memory. */
      const load = Effect.fn("SiteDrafts.load")(function* (id: DraftId) {
        const known = loaded.get(id);
        if (known !== undefined) return known;
        const row = yield* rowOf(id);
        const pages = yield* findPages(id);
        const draft: Draft = {
          id: row.id,
          site,
          base: { release: row.base_release, snapshot: row.base_snapshot },
          revision: row.revision,
          parts: row.parts,
          forms: row.forms,
          lockfile: row.lockfile,
          brand: row.brand,
          pages: Object.fromEntries(pages.map(({ document }) => [document.id, document])),
        };
        const writes = new Map(
          (yield* findWrites(id)).map((write) => [
            write.key,
            { actor: write.actor, revision: write.revision },
          ]),
        );
        const contracts = yield* Effect.promise(() => loadBlocks(draft.lockfile));
        const entry = { draft, writes, contracts };
        loaded.set(id, entry);
        return entry;
      });

      const store = (
        previous: Draft,
        committed: Extract<CommitResult, { ok: true }>,
        actor: Collaborator,
        batch: Batch,
        origin: Origin,
      ) =>
        sql.withTransaction(
          Effect.gen(function* () {
            const next = committed.draft;
            yield* sql`update drafts set
              revision = ${next.revision},
              base_release = ${next.base.release},
              base_snapshot = ${next.base.snapshot},
              parts = ${encode(SiteParts, next.parts)},
              forms = ${encode(Forms, next.forms)},
              lockfile = ${encode(Lockfile, next.lockfile)},
              brand = ${encode(BrandRevision, next.brand)}
              where id = ${next.id}`;
            if (!Equal.equals(previous.lockfile, next.lockfile))
              yield* sendBlocks(next.id, next.lockfile);
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
            // The agent's batches are the person's edits, for approving your own changes.
            yield* sql`insert into batches
              (id, draft_id, actor, actor_name, committed_at, revision, ops, inverse, origin, turn)
              values (${batch.id}, ${next.id}, ${actor.id}, ${actor.name},
                ${now()}, ${next.revision},
                ${encode(Ops, committed.ops)}, ${encode(Ops, committed.inverse)},
                ${originColumn(origin)},
                ${origin._tag === "Agent" ? origin.turn : null})`;
          }),
        );

      return SiteDrafts.of({
        list: Effect.gen(function* () {
          const [rows, editors] = yield* Effect.all([
            findDrafts(undefined),
            findEditors(undefined),
          ]);
          return rows.map((row) => summaryOf(row, editors));
        }),
        summary: Effect.fn("SiteDrafts.summary")(function* (id) {
          const row = yield* rowOf(id);
          return summaryOf(row, yield* findEditors(undefined));
        }),
        draft: (id) => Effect.map(load(id), ({ draft }) => draft),
        contracts: (id) => Effect.map(load(id), ({ contracts }) => contracts),
        openOfKind: Effect.fn("SiteDrafts.openOfKind")(function* (kind) {
          const [rows, editors] = yield* Effect.all([
            findDrafts(undefined),
            findEditors(undefined),
          ]);
          const row = rows.find(
            (candidate) => candidate.status === "open" && Equal.equals(candidate.kind, kind),
          );
          return Option.map(Option.fromNullishOr(row), (found) => summaryOf(found, editors));
        }),
        create: Effect.fn("SiteDrafts.create")(function* ({ name, kind, by, base, content }) {
          const id = DraftId.make(randomId("dr"));
          const createdAt = now();
          yield* sql.withTransaction(
            Effect.gen(function* () {
              yield* sql`insert into drafts
                (id, name, kind, status, created_by, created_at, base_release, base_snapshot,
                  revision, parts, forms, lockfile, brand)
                values (${id}, ${name}, ${encode(DraftKind, kind)}, 'open',
                  ${encode(Collaborator, by)}, ${createdAt},
                  ${base.release}, ${base.snapshot}, 0,
                  ${encode(SiteParts, content.parts)},
                  ${encode(Forms, content.forms)}, ${encode(Lockfile, content.lockfile)},
                  ${encode(BrandRevision, content.brand)})`;
              for (const page of Object.values(content.pages)) yield* writePage(id, page);
              yield* sendBlocks(id, content.lockfile);
            }),
          );
          return {
            id,
            name,
            kind,
            status: "open",
            base,
            createdBy: by,
            createdAt,
            lastEdit: null,
            people: [],
            closedAt: null,
            sharing: unshared,
          } satisfies DraftInfo;
        }),
        catchUp: Effect.fn("SiteDrafts.catchUp")(function* (id, revision) {
          const { draft } = yield* load(id);
          if (revision > draft.revision) return CatchUp.cases.Draft.make({ draft });
          const rows = yield* findBatchesSince({ draft: id, revision });
          if (rows.length > catchUpLimit) return CatchUp.cases.Draft.make({ draft });
          return CatchUp.cases.Batches.make({
            batches: rows.map((row) => ({
              id: row.id,
              revision: row.revision,
              actor: { id: row.actor, name: row.actor_name },
              turn: row.turn,
              ops: row.ops,
            })),
          });
        }),
        commit: Effect.fn("SiteDrafts.commit")(
          function* (
            actor,
            id,
            batch,
            origin,
          ): Effect.fn.Return<BatchResult, StorageError | DraftNotFound> {
            const row = yield* rowOf(id);
            const earlier = yield* findBatch(batch.id);
            if (Option.isSome(earlier))
              return { status: "duplicate", revision: earlier.value.revision };
            if (row.status !== "open")
              return rejected(
                "closed",
                "This draft was published or closed, so it takes no more changes.",
              );
            if (
              origin._tag !== "Site" &&
              origin._tag !== "Brand" &&
              batch.ops.some((op) => op.op === "rebase")
            )
              return rejected("system", "Only Pakshi moves a draft onto another release.");
            const { draft, writes, contracts: pinned } = yield* load(id);
            // A merge can move the draft to other block versions, which its ops are checked against.
            const lockfile =
              batch.ops.findLast((op) => op.op === "rebase")?.lockfile ?? draft.lockfile;
            const contracts = Equal.equals(lockfile, draft.lockfile)
              ? pinned
              : yield* Effect.promise(() => loadBlocks(lockfile));
            const committed = commitBatch(
              draft,
              writes,
              writer(actor, origin),
              batch,
              contracts,
              origin._tag === "Agent" ? "complete" : "draft",
            );
            if (!committed.ok) return { status: "rejected", errors: committed.errors };
            yield* store(draft, committed, actor, batch, origin);
            loaded.set(id, { draft: committed.draft, writes: committed.writes, contracts });
            return {
              status: "committed",
              commit: {
                batch: {
                  id: batch.id,
                  revision: committed.draft.revision,
                  actor,
                  turn: origin._tag === "Agent" ? origin.turn : null,
                  ops: committed.ops,
                },
                skipped: committed.skipped,
                replaced: committed.replaced.map(({ actor: person, op }) => ({ person, op })),
              },
            };
          },
        ),
        close: Effect.fn("SiteDrafts.close")(function* (id, status) {
          const row = yield* rowOf(id);
          yield* sql.withTransaction(
            Effect.gen(function* () {
              yield* sql`update drafts set status = ${status}, closed_at = ${now()} where id = ${id}`;
              yield* sendShares(id, row.name, null);
              yield* sendBlocks(id, null);
            }),
          );
        }),
        rename: Effect.fn("SiteDrafts.rename")(function* (id, name) {
          const row = yield* rowOf(id);
          yield* sql.withTransaction(
            Effect.gen(function* () {
              yield* sql`update drafts set name = ${name} where id = ${id}`;
              yield* sendShares(id, name, row.sharing);
            }),
          );
        }),
        share: Effect.fn("SiteDrafts.share")(function* (id, sharing) {
          const row = yield* rowOf(id);
          yield* sql.withTransaction(
            Effect.gen(function* () {
              yield* sql`update drafts set sharing = ${encode(DraftSharing, sharing)} where id = ${id}`;
              yield* sendShares(id, row.name, sharing);
            }),
          );
        }),
        editors: (id, revision) => findEditorsUpTo({ draft: id, revision }),
        editedSince: (id, revision) =>
          Effect.map(findEditedSince({ draft: id, revision }), Option.isSome),
        turnInverse: (id, turn) =>
          Effect.map(findTurnInverses({ draft: id, turn, undo: turnUndoId(turn) }), (rows) =>
            rows.flatMap((row) => row.inverse),
          ),
      });
    }),
  );
}
