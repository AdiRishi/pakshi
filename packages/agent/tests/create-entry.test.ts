import { describe, expect, it } from "@effect/vitest";
import { PageId } from "@repo/contracts/ids";
import { listingsOf } from "@repo/contracts/snapshot";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { Chat } from "effect/unstable/ai";

import { CreateEntry } from "../src/tools.ts";
import { runTurn } from "../src/turn.ts";
import { newsDraft } from "./support/draft.ts";
import { type Reply, scriptedModel } from "./support/model.ts";
import { desk } from "./support/workspace.ts";

/**
 * Runs a turn on the News draft on the morning of 2 October 2026 in Sydney,
 * where the person is, with the model replying from a script.
 */
const writing = (script: ReadonlyArray<Reply>) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Date.parse("2026-10-01T22:30:00Z"));
    const { state, layer } = yield* Effect.promise(() => desk(newsDraft));
    const model = scriptedModel(script);
    yield* runTurn({
      chat: yield* Chat.empty,
      system: "You edit pages.",
      message: "Write a post.",
      afterStep: Effect.void,
    }).pipe(Effect.provide(Layer.merge(layer, model.layer)));
    return { state, calls: model.calls };
  });

const createEntry = (params: typeof CreateEntry.parametersSchema.Encoded) => ({
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
      const { state, calls } = yield* writing([
        createEntry({
          collection: "pg_home",
          title: "Launch day moves to Friday",
          description: "The dinghies launch on Friday 14 August.",
        }),
      ]);
      expect(state.commits).toEqual([]);
      const toModel = JSON.stringify(calls[1]?.prompt);
      expect(toModel).toContain("(pg_home) isn't a blog");
      expect(toModel).toContain('pg_news \\"News\\"');
    }),
  );
});

describe("a post's address", () => {
  const dates = PageId.make("pg_dates");

  it.effect("changes with its slug, and the agent is told so when it tries a path", () =>
    Effect.gen(function* () {
      const { state, calls } = yield* writing([
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
      expect(JSON.stringify(calls[1]?.prompt)).toContain("Change the slug with setSlug instead.");
      expect(state.commits).toHaveLength(1);
      expect(listingsOf(state.draft.pages)).toContainEqual(
        expect.objectContaining({ id: dates, path: "/news/dates" }),
      );
    }),
  );
});
