import { type DraftId, SnapshotId, SubmissionId } from "@repo/contracts/ids";
import { SubmissionNotFound } from "@repo/contracts/studio";
import { Submission } from "@repo/contracts/submission";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { type SqlError, SqlClient, SqlSchema } from "effect/sql";

import { Outbox } from "./outbox.ts";

/*
 * A site's submissions for approval, in its SiteDoc's SQLite storage. D1
 * keeps a copy of each for the Approvals screen, fed through the outbox in
 * the same transaction as each change.
 */

/** A submission with what SiteDoc keeps of it beyond what approvers see. */
export interface Stored {
  readonly submission: Submission;
  /** The draft revision it froze. Edits after it aren't part of the submission. */
  readonly revision: number;
  /** The snapshot it froze to, before any merge during review changed it. */
  readonly frozen: SnapshotId;
}

const SubmissionRow = Schema.Struct({
  revision: Schema.Int,
  frozen_snapshot: SnapshotId,
  submission: Schema.fromJsonString(Submission),
});

const encodeSubmission = Schema.encodeSync(Schema.fromJsonString(Submission));

const storedOf = (row: typeof SubmissionRow.Type): Stored => ({
  submission: row.submission,
  revision: row.revision,
  frozen: row.frozen_snapshot,
});

type StorageError = SqlError.SqlError | Schema.SchemaError;

export class SiteApprovals extends Context.Service<
  SiteApprovals,
  {
    readonly get: (id: SubmissionId) => Effect.Effect<Stored, StorageError | SubmissionNotFound>;
    /** Every submission still under review. */
    readonly inReview: Effect.Effect<ReadonlyArray<Stored>, StorageError>;
    /** Each draft's latest submission, whatever became of it. */
    readonly latest: Effect.Effect<ReadonlyMap<DraftId, Submission>, StorageError>;
    /** Records a new or changed submission, and queues its copy for D1. */
    readonly record: (stored: Stored) => Effect.Effect<void, StorageError>;
  }
>()("Pakshi/StudioApi/SiteApprovals") {
  static readonly layer = Layer.effect(
    SiteApprovals,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const outbox = yield* Outbox;
      const findOne = SqlSchema.findOneOption({
        Request: SubmissionId,
        Result: SubmissionRow,
        execute: (id) =>
          sql`select revision, frozen_snapshot, submission from submissions where id = ${id}`,
      });
      const findInReview = SqlSchema.findAll({
        Request: Schema.Void,
        Result: SubmissionRow,
        execute: () => sql`select revision, frozen_snapshot, submission from submissions
          where json_extract(submission, '$.status._tag') = 'InReview'
          order by json_extract(submission, '$.submittedAt')`,
      });
      const findLatest = SqlSchema.findAll({
        Request: Schema.Void,
        Result: SubmissionRow,
        execute: () => sql`select revision, frozen_snapshot, submission from submissions s
          where not exists (
            select 1 from submissions later where later.draft_id = s.draft_id
              and json_extract(later.submission, '$.submittedAt')
                > json_extract(s.submission, '$.submittedAt'))`,
      });

      return SiteApprovals.of({
        get: Effect.fn("SiteApprovals.get")(function* (id) {
          const row = yield* findOne(id);
          if (Option.isNone(row)) return yield* new SubmissionNotFound({ submission: id });
          return storedOf(row.value);
        }),
        inReview: Effect.map(findInReview(undefined), (rows) => rows.map(storedOf)),
        latest: Effect.map(
          findLatest(undefined),
          (rows) => new Map(rows.map((row) => [row.submission.draft.id, row.submission])),
        ),
        record: ({ submission, revision, frozen }) =>
          sql.withTransaction(
            Effect.gen(function* () {
              yield* sql`insert into submissions (id, draft_id, revision, frozen_snapshot, submission)
                values (${submission.id}, ${submission.draft.id}, ${revision}, ${frozen},
                  ${encodeSubmission(submission)})
                on conflict (id) do update set submission = excluded.submission`;
              yield* outbox.send({ _tag: "Submission", submission });
            }),
          ),
      });
    }),
  );
}
