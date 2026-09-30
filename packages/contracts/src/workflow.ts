import { Schema } from "effect";

import { DefaultRole } from "./access.ts";
import { Collaborator } from "./live.ts";

/**
 * One step of an approval workflow: who can approve, and how many of them
 * must. Someone can approve if the step names them, or names a role they
 * hold on a scope that covers the site.
 */
export const WorkflowStep = Schema.Struct({
  name: Schema.Trim.check(
    Schema.isMinLength(1, { message: "Give the step a name" }),
    Schema.isMaxLength(60, { message: "Use at most 60 characters" }),
  ),
  roles: Schema.Array(DefaultRole),
  people: Schema.Array(Collaborator),
  required: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
}).check(
  Schema.makeFilter((step) => {
    if (step.roles.length === 0 && step.people.length === 0)
      return "Choose who can approve this step";
    if (step.roles.length === 0 && step.required > step.people.length)
      return "A step can't need more approvals than it has people";
    return undefined;
  }),
);
export type WorkflowStep = typeof WorkflowStep.Type;

/** The steps a submission goes through, in order. With none, submitting publishes. */
export const Workflow = Schema.Array(WorkflowStep);
export type Workflow = typeof Workflow.Type;
