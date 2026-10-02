import { loadBlocks } from "@repo/blocks";
import { Draft } from "@repo/contracts/draft";
import type { CheckIssue } from "@repo/contracts/publishing";
import { freeze } from "@repo/domain/freeze";
import { Schema } from "effect";
import { expect, test } from "vitest";

import { issueForAgent, personOnly } from "../src/issues.ts";
import { draftToFix as draft, newsDraft, sampleListDraft } from "./support/draft.ts";

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

const issuesIn = (checked: Draft) => {
  const result = freeze(checked, contracts, { pages: [], gone: [] }, new Set());
  return result.ok ? [] : result.issues;
};

test("a list of posts still on the sample posts is the agent's to point at a blog", () => {
  const issue = issuesIn(sampleListDraft).find(
    (candidate) => candidate._tag === "Placeholder" && candidate.path.join(".") === "collection",
  );
  if (issue === undefined) throw new Error("The checks found no sample list of posts.");
  expect(personOnly(issue, sampleListDraft, contracts)).toBeNull();
  expect(issueForAgent(issue, sampleListDraft, contracts)).toContain(
    'block b_latest, field collection: still shows sample posts. Point it at the blog it should show with setProp, as {"$ref": "page", "id": "pg_…"}: pg_news "News".',
  );
});

test("a link to a post in an unpublished blog says the blog is what to publish again", () => {
  const encoded = Schema.encodeSync(Draft)(newsDraft);
  const news = encoded.pages["pg_news"];
  if (news === undefined) throw new Error("The News draft has no blog.");
  const unpublishedNews = Schema.decodeSync(Draft)({
    ...encoded,
    parts: {
      ...encoded.parts,
      menus: {
        main: [{ id: "mi_dates", label: "Dates", target: { $ref: "page", id: "pg_dates" } }],
        footer: [],
      },
    },
    pages: { ...encoded.pages, pg_news: { ...news, status: "unpublished" } },
  });
  const broken = issuesIn(unpublishedNews).find((issue) => issue._tag === "BrokenLink");
  if (broken === undefined) throw new Error("The checks found no broken link.");
  expect(issueForAgent(broken, unpublishedNews, contracts)).toContain(
    'links to pg_dates "Dates announced", a post in pg_news "News", which is unpublished in this draft. Point it at a published page, or ask the person whether to publish pg_news "News" again with setStatus.',
  );
});
