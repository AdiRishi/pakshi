import { DraftId, ReleaseId, SiteId, SnapshotId, SubmissionId } from "@repo/contracts/ids";
import { Timestamp } from "@repo/contracts/release";
import type { Submission } from "@repo/contracts/submission";
import type { Workflow } from "@repo/contracts/workflow";

const editor = { id: "user_editor", name: "user_editor" };

/** A submission of a Northbank draft under review, sent by someone who edited it. */
export const northbankSubmission = (
  steps: Workflow,
  overrides: Partial<Pick<Submission, "id" | "approvals" | "status">> = {},
): Submission => ({
  id: SubmissionId.make("sub_hours"),
  site: SiteId.make("site_a1"),
  draft: { id: DraftId.make("dr_hours"), name: "Opening hours" },
  snapshot: SnapshotId.make("snap_hours"),
  base: { release: ReleaseId.make("rel_first"), snapshot: SnapshotId.make("snap_first") },
  submittedBy: editor,
  submittedAt: Timestamp.make("2026-10-01T09:00:00.000Z"),
  editedBy: [editor],
  note: "",
  steps,
  approvals: [],
  status: { _tag: "InReview" },
  ...overrides,
});
