import type { Permission, RoleId } from "@repo/contracts/access";
import type { Collaborator } from "@repo/contracts/live";
import { currentStep, type Submission } from "@repo/contracts/submission";

/** Someone who may be able to decide on a submission, with what they hold on its site. */
export interface Approver {
  readonly person: Collaborator;
  /** The roles they hold through grants that cover the site. */
  readonly roles: ReadonlyArray<RoleId>;
  readonly permissions: ReadonlyArray<Permission>;
}

/** Whether someone may decide on a submission's current step now, or why not. */
export type Eligibility =
  | { readonly ok: true; readonly step: number }
  | { readonly ok: false; readonly reason: string };

/**
 * May this person approve, or request changes to, the submission's current
 * step? The step must name them or one of their roles, and they need
 * `site.approve`. Someone who edited the draft also needs `site.approve_own`,
 * and each person's approval counts once per submission.
 */
export const eligibility = (
  submission: Pick<Submission, "steps" | "approvals" | "status" | "editedBy">,
  approver: Approver,
): Eligibility => {
  const index = currentStep(submission);
  const step = index === null ? undefined : submission.steps[index];
  if (submission.status._tag !== "InReview" || index === null || step === undefined)
    return { ok: false, reason: "This submission isn't waiting for a decision." };
  if (!approver.permissions.includes("site.approve"))
    return { ok: false, reason: "You can't approve changes to this site." };
  if (submission.approvals.some((approval) => approval.by.id === approver.person.id))
    return { ok: false, reason: "You've already approved this submission." };
  const named =
    step.people.some((person) => person.id === approver.person.id) ||
    step.roles.some((role) => approver.roles.includes(role.id));
  if (!named) return { ok: false, reason: `This step is for ${step.name}.` };
  if (
    submission.editedBy.some((person) => person.id === approver.person.id) &&
    !approver.permissions.includes("site.approve_own")
  )
    return { ok: false, reason: "You edited this draft, so someone else approves it." };
  return { ok: true, step: index };
};
