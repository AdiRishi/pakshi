import { loadBlocks } from "@repo/blocks";
import { emptyVoiceGuide } from "@repo/contracts/brand";
import { BlockId, PageId } from "@repo/contracts/ids";
import { describe, expect, test } from "vitest";

import { systemPrompt, turnContext } from "../src/prompt.ts";
import { harbourDraft } from "./support/draft.ts";

const contracts = await loadBlocks(harbourDraft.lockfile);
const home = PageId.make("pg_home");

test("the agent writes in the brand's voice: its tone, examples and words to avoid", () => {
  const prompt = systemPrompt(
    contracts,
    {
      tone: "Friendly and plain, like a librarian at the front desk.",
      examples: [{ write: "Borrow up to 20 books.", avoid: "Patrons may avail themselves." }],
      wordsToAvoid: ["patrons", "world-class"],
    },
    null,
  );
  expect(prompt).toContain("Friendly and plain, like a librarian at the front desk.");
  expect(prompt).toContain('Write like this: "Borrow up to 20 books."');
  expect(prompt).toContain('Not like this: "Patrons may avail themselves."');
  expect(prompt).toContain("Never use these words: patrons, world-class.");
});

test("a brand without a voice guide says so, rather than leaving the agent to guess", () => {
  expect(systemPrompt(contracts, emptyVoiceGuide, null)).toContain(
    "The brand has no voice guide yet.",
  );
});

describe("what the agent is told with each message", () => {
  const context = (options: Pick<Parameters<typeof turnContext>[0], "selected" | "typing">) =>
    turnContext({
      draft: harbourDraft,
      contracts,
      person: { id: "user_sam", name: "Sam Okafor" },
      page: harbourDraft.pages[home],
      sources: [],
      ...options,
    });

  test("names the block the person has selected, so 'this' means it", () => {
    const selected = {
      page: home,
      focus: { target: home, block: BlockId.make("b_hero"), path: ["heading"] },
      title: "Hero",
    };
    expect(context({ selected, typing: [] })).toContain(
      "Selected: b_hero, a Hero block, field heading.",
    );
  });

  test("names the fields people are typing in", () => {
    const typing = [
      {
        target: home,
        block: BlockId.make("b_about"),
        path: ["body"],
        person: { id: "user_meera", name: "Meera Kapoor" },
      },
    ];
    expect(context({ selected: null, typing })).toContain("Meera Kapoor in b_about body");
  });
});
