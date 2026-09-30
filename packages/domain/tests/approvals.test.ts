import type { DefaultRole, Permission } from "@repo/contracts/access";
import type { Collaborator } from "@repo/contracts/live";
import { Timestamp } from "@repo/contracts/release";
import type { Submission } from "@repo/contracts/submission";
import type { WorkflowStep } from "@repo/contracts/workflow";
import { describe, expect, test } from "vitest";

import { eligibility } from "../src/approvals.ts";

const sam = { id: "user_sam", name: "Sam Okafor" };
const jonah = { id: "user_jonah", name: "Jonah Reyes" };
const meera = { id: "user_meera", name: "Meera Kapoor" };
const priya = { id: "user_priya", name: "Priya Shah" };

const approvers: WorkflowStep = {
  name: "Communications team",
  roles: ["approver"],
  people: [],
  required: 1,
};
const manager = (people: ReadonlyArray<Collaborator>, required = 1): WorkflowStep => ({
  name: "Library manager",
  roles: [],
  people,
  required,
});

const at = Timestamp.make("2026-10-01T09:00:00.000Z");

/** A submission of a draft Sam edited, waiting in review. */
const inReview = (
  steps: ReadonlyArray<WorkflowStep>,
  approvedBy: ReadonlyArray<{ readonly step: number; readonly by: Collaborator }> = [],
): Pick<Submission, "steps" | "approvals" | "status" | "editedBy"> => ({
  steps,
  approvals: approvedBy.map((approval) => ({ ...approval, at, note: "" })),
  status: { _tag: "InReview" },
  editedBy: [sam],
});

const approver = (
  person: Collaborator,
  roles: ReadonlyArray<DefaultRole>,
  permissions: ReadonlyArray<Permission> = ["site.approve"],
) => ({ person, roles, permissions });

describe("deciding on a submission", () => {
  test("a step's role lets its holders decide, and names the step they decide on", () => {
    expect(eligibility(inReview([approvers]), approver(jonah, ["approver"]))).toEqual({
      ok: true,
      step: 0,
    });
  });

  test("someone the current step doesn't name can't decide, even if a later step does", () => {
    const steps = [approvers, manager([meera])];
    expect(eligibility(inReview(steps), approver(meera, ["org-admin"])).ok).toBe(false);
    expect(eligibility(inReview(steps, [{ step: 0, by: jonah }]), approver(meera, []))).toEqual({
      ok: true,
      step: 1,
    });
  });

  test("deciding needs the approve permission", () => {
    expect(eligibility(inReview([approvers]), approver(jonah, ["approver"], []))).toEqual({
      ok: false,
      reason: "You can't approve changes to this site.",
    });
  });

  test("someone who edited the draft needs the permission to approve their own changes", () => {
    const submission = inReview([manager([sam])]);
    expect(eligibility(submission, approver(sam, [])).ok).toBe(false);
    expect(
      eligibility(submission, approver(sam, [], ["site.approve", "site.approve_own"])),
    ).toEqual({
      ok: true,
      step: 0,
    });
  });

  test("a person's approval counts once per submission", () => {
    const submission = inReview([manager([meera, priya], 2)], [{ step: 0, by: meera }]);
    expect(eligibility(submission, approver(meera, [])).ok).toBe(false);
    expect(eligibility(submission, approver(priya, []))).toEqual({ ok: true, step: 0 });
  });

  test("a submission that isn't in review takes no decisions", () => {
    const replaced = { ...inReview([approvers]), status: { _tag: "Replaced", at } as const };
    expect(eligibility(replaced, approver(jonah, ["approver"])).ok).toBe(false);
  });
});
