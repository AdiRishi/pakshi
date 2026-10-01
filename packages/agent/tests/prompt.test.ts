import { loadBlocks } from "@repo/blocks";
import { emptyVoiceGuide } from "@repo/contracts/brand";
import { expect, test } from "vitest";

import { systemPrompt } from "../src/prompt.ts";
import { harbourDraft } from "./support/draft.ts";

const contracts = await loadBlocks(harbourDraft.lockfile);

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
