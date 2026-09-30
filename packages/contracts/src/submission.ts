import { Schema } from "effect";

import { DraftName } from "./draft.ts";
import { DraftId, ReleaseId, SiteId, SnapshotId, SubmissionId } from "./ids.ts";
import { Collaborator } from "./live.ts";
import { Timestamp } from "./release.ts";
import { LiveRelease } from "./snapshot.ts";
import { Workflow } from "./workflow.ts";

/** One person's approval of a submission, at the step it counted for. */
export const Approval = Schema.Struct({
  step: Schema.Int,
  by: Collaborator,
  at: Timestamp,
  note: Schema.String,
});
export type Approval = typeof Approval.Type;

/** Where a submission stands. Only one under review can still change. */
export const SubmissionStatus = Schema.TaggedUnion({
  InReview: {},
  Published: { release: ReleaseId, at: Timestamp },
  ChangesRequested: { by: Collaborator, at: Timestamp, note: Schema.String },
  /** Another release went live, and merging it in needs a person, so the draft must be updated and submitted again. */
  NeedsUpdate: { at: Timestamp },
  /** Its draft was submitted again. */
  Replaced: { at: Timestamp },
  /** Its draft was closed without publishing. */
  Withdrawn: { by: Collaborator, at: Timestamp },
});
export type SubmissionStatus = typeof SubmissionStatus.Type;

/**
 * A draft frozen for approval. Approvers review its snapshot, which changes
 * only when a release that went live during review merges in cleanly. It
 * keeps the workflow's steps as they were when it was submitted.
 */
export const Submission = Schema.Struct({
  id: SubmissionId,
  site: SiteId,
  draft: Schema.Struct({ id: DraftId, name: DraftName }),
  snapshot: SnapshotId,
  /** The release the snapshot is based on. */
  base: LiveRelease,
  submittedBy: Collaborator,
  submittedAt: Timestamp,
  /** Everyone who changed the draft before it was submitted. */
  editedBy: Schema.Array(Collaborator),
  note: Schema.String,
  steps: Workflow,
  approvals: Schema.Array(Approval),
  status: SubmissionStatus,
});
export type Submission = typeof Submission.Type;

/** The step waiting for approvals, by its position, or null once every step has the approvals it needs. */
export const currentStep = (submission: Pick<Submission, "steps" | "approvals">) => {
  const index = submission.steps.findIndex(
    (step, position) =>
      submission.approvals.filter((approval) => approval.step === position).length <
      step.required,
  );
  return index === -1 ? null : index;
};
