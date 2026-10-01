import { Schema } from "effect";
import { expect, test } from "vitest";

import { WorkflowStep } from "../src/workflow.ts";

const sam = { id: "user_sam", name: "Sam Okafor" };
const ana = { id: "user_ana", name: "Ana Lima" };

const issues = (step: typeof WorkflowStep.Encoded) => {
  const result = Schema.decodeExit(WorkflowStep)(step);
  return result._tag === "Success" ? "" : String(result.cause);
};

test("a step can always gather the approvals it needs", () => {
  expect(issues({ name: "Comms", roles: [], people: [sam, ana], required: 2 })).toBe("");
  expect(
    issues({
      name: "Comms",
      roles: [{ id: "approver", name: "Approver" }],
      people: [],
      required: 3,
    }),
  ).toBe("");
  expect(issues({ name: "Comms", roles: [], people: [sam], required: 2 })).toContain(
    "A step can't need more approvals than it has people",
  );
  expect(issues({ name: "Comms", roles: [], people: [], required: 1 })).toContain(
    "Choose who can approve this step",
  );
});
