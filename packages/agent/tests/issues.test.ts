import { loadBlocks } from "@repo/blocks";
import type { CheckIssue } from "@repo/contracts/publishing";
import { freeze } from "@repo/domain/freeze";
import { expect, test } from "vitest";

import { issueForAgent, personOnly } from "../src/issues.ts";
import { draftToFix as draft } from "./support/draft.ts";

const contracts = await loadBlocks(draft.lockfile);
const frozen = freeze(draft, contracts, { pages: [], gone: [] }, new Set());
const issues = frozen.ok ? [] : frozen.issues;

const found = (tag: CheckIssue["_tag"]) => {
  const issue = issues.find((candidate) => candidate._tag === tag);
  if (issue === undefined) throw new Error(`The checks found no ${tag}.`);
  return issue;
};

test("only a person chooses images, confirms alt text and sets where form entries go", () => {
  expect(issues).toHaveLength(6);
  expect(
    Object.fromEntries(issues.map((issue) => [issue._tag, personOnly(issue, draft, contracts)])),
  ).toEqual({
    BrokenLink: null,
    Incomplete: "alt-text",
    MissingConsent: null,
    MissingMeta: null,
    NoFormEmails: "settings",
    Placeholder: "image",
  });
});

test("the agent reads each issue with the IDs it edits by", () => {
  expect(issueForAgent(found("MissingMeta"), draft, contracts)).toBe(
    "Harbour Summer School (pg_home): no description. Set it with setMeta.",
  );
  expect(issueForAgent(found("BrokenLink"), draft, contracts)).toContain(
    'links to pg_old "Old programme", which is unpublished in this draft.',
  );
  expect(issueForAgent(found("MissingConsent"), draft, contracts)).toContain(
    'Form frm_contact "Contact"',
  );
});

test("the agent is told which issues to leave for the person, and why", () => {
  expect(issueForAgent(found("Incomplete"), draft, contracts)).toMatch(
    /^Harbour Summer School \(pg_home\), Hero block b_hero, field image\.alt: .+ Only a person can fix this: you can't see the image/,
  );
  expect(issueForAgent(found("Placeholder"), draft, contracts)).toContain(
    "Only a person can fix this: you can't choose images.",
  );
  expect(issueForAgent(found("MissingMeta"), draft, contracts)).not.toContain("Only a person");
});
