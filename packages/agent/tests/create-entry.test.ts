import { describe, expect, it } from "@effect/vitest";
import { PageId } from "@repo/contracts/ids";
import { listingsOf } from "@repo/contracts/snapshot";
import { Effect } from "effect";
import { TestClock } from "effect/testing";

import { createEntry as createEntryTool } from "../src/tools.ts";
import { newsDraft } from "./support/draft.ts";
import { type Reply, refusalsIn } from "./support/model.ts";
import { turnWith } from "./support/turn.ts";

/**
 * Runs a turn on the News draft on the morning of 2 October 2026 in Sydney,
 * where the person is, with the model replying from a script.
 */
const writing = (script: ReadonlyArray<Reply>) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Date.parse("2026-10-01T22:30:00Z"));
    return yield* turnWith(script, "Write a post.", { draft: newsDraft });
  });

const createEntry = (params: typeof createEntryTool.inputSchema.Encoded) => ({
  calls: [{ name: "create_entry", params }],
});

describe("creating a post", () => {
  it.effect(
    "puts it in the blog at an address from its title, dated today where the person is, by them",
    () =>
      Effect.gen(function* () {
        const { state } = yield* writing([
          createEntry({
            collection: "pg_news",
            title: "Launch day moves to Friday",
            description: "The dinghies launch on Friday 14 August.",
          }),
        ]);
        const added = Object.values(state.draft.pages).find(
          (page) => !(page.id in newsDraft.pages),
        );
        expect(added).toMatchObject({
          type: "entry",
          collection: "pg_news",
          recipe: "post",
          meta: { title: "Launch day moves to Friday", date: "2026-10-02", author: "Sam Okafor" },
        });
        expect(listingsOf(state.draft.pages)).toContainEqual(
          expect.objectContaining({ id: added?.id, path: "/news/launch-day-moves-to-friday" }),
        );
        expect(
          added?.root.map((block) => added.blocks[block]?.type),
          "the post recipe's sections",
        ).toEqual(["post-header", "rich-text"]);
      }),
  );

  it.effect("takes the slug it's given", () =>
    Effect.gen(function* () {
      const { state } = yield* writing([
        createEntry({
          collection: "pg_news",
          title: "Launch day moves to Friday",
          slug: "launch-day",
          description: "The dinghies launch on Friday 14 August.",
        }),
      ]);
      expect(listingsOf(state.draft.pages).map((listing) => listing.path)).toContain(
        "/news/launch-day",
      );
    }),
  );

  it.effect("refuses a page that isn't a blog, and names the blogs there are", () =>
    Effect.gen(function* () {
      const { state, requests } = yield* writing([
        createEntry({
          collection: "pg_home",
          title: "Launch day moves to Friday",
          description: "The dinghies launch on Friday 14 August.",
        }),
      ]);
      expect(state.commits).toEqual([]);
      expect(refusalsIn(requests[1])).toEqual([
        expect.stringContaining(
          "(pg_home) isn't a blog. Posts go in one of the draft's blogs: pg_news \"News\"",
        ),
      ]);
    }),
  );
});

describe("a post's address", () => {
  const dates = PageId.make("pg_dates");

  it.effect("changes with its slug, and the agent is told so when it tries a path", () =>
    Effect.gen(function* () {
      const { state, requests } = yield* writing([
        {
          calls: [
            {
              name: "apply_ops",
              params: { page: dates, ops: [{ op: "setPath", path: "/dates" }] },
            },
          ],
        },
        {
          calls: [
            {
              name: "apply_ops",
              params: { page: dates, ops: [{ op: "setSlug", slug: "dates" }] },
            },
          ],
        },
      ]);
      expect(JSON.stringify(requests[1]?.messages)).toContain(
        "Change the slug with setSlug instead.",
      );
      expect(state.commits).toHaveLength(1);
      expect(listingsOf(state.draft.pages)).toContainEqual(
        expect.objectContaining({ id: dates, path: "/news/dates" }),
      );
    }),
  );
});
