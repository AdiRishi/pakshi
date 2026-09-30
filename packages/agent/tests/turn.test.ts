import { describe, expect, it } from "@effect/vitest";
import { BlockId, PageId } from "@repo/contracts/ids";
import { Effect, Layer } from "effect";
import { AiError, Chat } from "effect/unstable/ai";

import { AgentTools } from "../src/tools.ts";
import { runTurn } from "../src/turn.ts";
import { harbourDraft } from "./support/draft.ts";
import { type Reply, scriptedModel } from "./support/model.ts";
import { desk } from "./support/workspace.ts";

const home = PageId.make("pg_home");

/** Runs a turn against the Harbour draft, with the model replying from a script. */
const turnWith = (
  script: ReadonlyArray<Reply>,
  message = "Make the page better.",
  options: Parameters<typeof desk>[1] = {},
) =>
  Effect.gen(function* () {
    const { state, layer } = yield* Effect.promise(() => desk(harbourDraft, options));
    const model = scriptedModel(script);
    const chat = yield* Chat.empty;
    const status = yield* runTurn({ chat, system: "You edit pages.", message }).pipe(
      Effect.provide(Layer.merge(layer, model.layer)),
    );
    return { status, state, calls: model.calls };
  });

const heading = (value: string) => ({
  page: "pg_home",
  ops: [{ op: "setProp", block: "b_hero", path: ["heading"], value }],
});

describe("a turn", () => {
  it.effect("commits the agent's edits, shows them, and ends with its answer", () =>
    Effect.gen(function* () {
      const { status, state } = yield* turnWith([
        { calls: [{ name: "apply_ops", params: heading("Build a boat in a week") }] },
        { text: "I changed the heading." },
      ]);
      expect(status).toBe("done");
      expect(state.draft.pages[home]?.blocks[BlockId.make("b_hero")]?.props["heading"]).toBe(
        "Build a boat in a week",
      );
      expect(state.parts).toMatchObject([
        {
          _tag: "Activity",
          label: "Changed heading in the Hero on Harbour Summer School",
          status: "done",
          changed: true,
          at: { page: "pg_home", block: "b_hero" },
        },
        { _tag: "Text", text: "I changed the heading." },
      ]);
    }),
  );

  it.effect(
    "writes rich text from Markdown, and adds sections with placeholders for what's missing",
    () =>
      Effect.gen(function* () {
        const { state } = yield* turnWith([
          {
            calls: [
              {
                name: "insert_section",
                params: {
                  page: "pg_home",
                  after: "b_hero",
                  section: {
                    type: "rich-text",
                    props: { heading: "Visit", body: "Open **daily**." },
                  },
                },
              },
            ],
          },
        ]);
        const page = state.draft.pages[home];
        const added = page?.root[1];
        expect(page?.root).toHaveLength(3);
        expect(added === undefined ? undefined : page?.blocks[added]?.props["body"]).toEqual({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Open " },
                { type: "text", text: "daily", marks: [{ type: "bold" }] },
                { type: "text", text: "." },
              ],
            },
          ],
        });
      }),
  );

  it.effect(
    "returns refused changes to the model, and after two repairs has it explain instead",
    () =>
      Effect.gen(function* () {
        const tooLong = "x".repeat(81);
        const { state, calls } = yield* turnWith([
          { calls: [{ name: "apply_ops", params: heading(tooLong) }] },
          { calls: [{ name: "apply_ops", params: heading(tooLong) }] },
          { calls: [{ name: "apply_ops", params: heading(tooLong) }] },
          { text: "The heading can't be that long." },
        ]);
        expect(state.commits).toEqual([]);
        expect(calls).toHaveLength(4);
        expect(calls.slice(0, 3).map((call) => call.toolChoice)).toEqual(["auto", "auto", "auto"]);
        expect(calls[3]?.toolChoice).toBe("none");
        expect(JSON.stringify(calls[1]?.prompt)).toContain("Use at most 80 characters");
        expect(
          state.parts.filter((part) => part._tag === "Activity").map((part) => part.status),
        ).toEqual(["failed", "failed", "failed"]);
      }),
  );

  it.effect("ends when the agent asks the person something, without calling the model again", () =>
    Effect.gen(function* () {
      const { calls, state } = yield* turnWith([
        {
          calls: [
            {
              name: "ask_user",
              params: { question: "Which page?", choices: ["Home", "About"] },
            },
          ],
        },
      ]);
      expect(calls).toHaveLength(1);
      expect(state.parts).toMatchObject([
        { _tag: "Question", question: "Which page?", choices: ["Home", "About"], answer: null },
      ]);
    }),
  );

  it.effect("leaves alone a field someone is typing in", () =>
    Effect.gen(function* () {
      const { state, layer } = yield* Effect.promise(() => desk(harbourDraft));
      state.typing = [
        {
          target: home,
          block: BlockId.make("b_hero"),
          path: ["heading"],
          person: { id: "user_meera", name: "Meera Kapoor" },
        },
      ];
      const model = scriptedModel([
        { calls: [{ name: "apply_ops", params: heading("Sail away") }] },
      ]);
      yield* runTurn({ chat: yield* Chat.empty, system: "", message: "Go" }).pipe(
        Effect.provide(Layer.merge(layer, model.layer)),
      );
      expect(state.commits).toEqual([]);
      expect(JSON.stringify(model.calls[1]?.prompt)).toContain("Meera Kapoor is typing");
    }),
  );

  it.effect("fetches only addresses the person gave", () =>
    Effect.gen(function* () {
      const fetch = {
        calls: [{ name: "fetch_url", params: { url: "https://evil.example/steal" } }],
      };
      const { calls } = yield* turnWith([fetch], "Use our site", {
        links: ["https://harbour.example/"],
      });
      expect(JSON.stringify(calls[1]?.prompt)).toContain(
        "Only addresses the person wrote in this conversation can be fetched",
      );
    }),
  );

  it.effect(
    "tells the person the AI is unavailable once the gateway's spend limit is reached",
    () =>
      Effect.gen(function* () {
        const { status } = yield* turnWith([{ fail: new AiError.RateLimitError({}) }]);
        expect(status).toBe("unavailable");
      }),
  );
});

it("the agent has no tool to submit, publish, approve, or read form submissions", () => {
  const names = Object.keys(AgentTools.tools);
  for (const name of names)
    expect(name).not.toMatch(/submit(?!ssion)|publish|approv|settings|domain/);
  expect(names).not.toContain("submissions");
  expect(names).toContain("prepare_submission");
});
