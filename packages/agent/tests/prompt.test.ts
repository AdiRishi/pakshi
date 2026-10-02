import { loadBlocks } from "@repo/blocks";
import { emptyVoiceGuide } from "@repo/contracts/brand";
import { Draft } from "@repo/contracts/draft";
import { BlockId, PageId } from "@repo/contracts/ids";
import { Schema } from "effect";
import { describe, expect, test } from "vitest";

import { systemPrompt, turnContext } from "../src/prompt.ts";
import { harbourDraft, newsDraft, newsPost } from "./support/draft.ts";

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
  const context = (
    options: Pick<Parameters<typeof turnContext>[0], "selected" | "typing">,
    draft = harbourDraft,
  ) =>
    turnContext({
      draft,
      contracts,
      person: { id: "user_sam", name: "Sam Okafor" },
      page: draft.pages[home],
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

  test("lists each blog with how many posts it has, and its 20 newest", () => {
    const encoded = Schema.encodeSync(Draft)(newsDraft);
    const july = Array.from({ length: 20 }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return newsPost(`pg_july${day}`, `july-${day}`, `July ${day}`, `2026-07-${day}`);
    });
    const draft = Schema.decodeSync(Draft)({
      ...encoded,
      pages: { ...encoded.pages, ...Object.fromEntries(july.map((post) => [post.id, post])) },
    });
    const lines = context({ selected: null, typing: [] }, draft).split("\n");
    const blog = lines.findIndex((line) => line.startsWith("pg_news "));
    expect(lines[blog]).toBe('pg_news collection(blog) /news "News" recipe blog — 22 posts');
    expect(lines.slice(blog + 2, blog + 4)).toEqual([
      '  pg_mentors entry(blog) /news/meet-the-mentors "Meet the mentors" 2026-09-15',
      '  pg_dates entry(blog) /news/dates-announced "Dates announced" 2026-08-01',
    ]);
    expect(lines[blog + 21]).toBe('  pg_july03 entry(blog) /news/july-03 "July 03" 2026-07-03');
    expect(lines[blog + 22]).toBe("  and 2 older posts, which get_page pg_news lists");
    expect(lines.some((line) => line.includes("pg_july01"))).toBe(false);
  });
});
