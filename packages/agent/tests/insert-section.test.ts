import { expect, it } from "@effect/vitest";
import { emptyVoiceGuide } from "@repo/contracts/brand";
import { PageId } from "@repo/contracts/ids";
import { Effect, Layer, Schema } from "effect";
import { Chat } from "effect/unstable/ai";

import { languageModel, type ModelRequest } from "../src/model.ts";
import { systemPrompt } from "../src/prompt.ts";
import { InsertSection } from "../src/tools.ts";
import { runTurn } from "../src/turn.ts";
import { harbourDraft } from "./support/draft.ts";
import { eventStream, textStream } from "./support/workers-ai.ts";
import { desk } from "./support/workspace.ts";

const home = PageId.make("pg_home");
const emptyHome = {
  ...harbourDraft,
  pages: Object.fromEntries(
    Object.entries(harbourDraft.pages).map(([id, page]) => [id, { ...page, root: [], blocks: {} }]),
  ),
};

const insertionResult = Schema.Struct({
  role: Schema.Literal("tool"),
  content: Schema.fromJsonString(InsertSection.successSchema),
});
const readResult = Schema.decodeUnknownSync(insertionResult);
const readMessages = Schema.decodeUnknownSync(Schema.Array(Schema.Json));

const sectionCall = (after: string | null | undefined, type: string, step: number) => [
  JSON.stringify({
    choices: [
      {
        delta: {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: `call_${step}`,
              type: "function",
              function: {
                name: "insert_section",
                arguments: JSON.stringify({ page: home, after, section: { type } }),
              },
            },
          ],
        },
        finish_reason: "tool_calls",
        index: 0,
      },
    ],
    created: 1790788667,
    id: `chat_${step}`,
    model: "@cf/zai-org/glm-5.3-flash",
    object: "chat.completion.chunk",
  }),
  "[DONE]",
];

const buildHome = (firstAfter: string | null | undefined) =>
  Effect.gen(function* () {
    const { state, layer, contracts } = yield* Effect.promise(() => desk(emptyHome));
    const sent: Array<ModelRequest> = [];
    const types = ["hero", "feature-grid", "call-to-action"];
    const model = languageModel(
      async (request) => {
        const step = sent.length;
        sent.push(request);
        const section = step - (firstAfter === null || step === 0 ? 0 : 1);
        const type = types[section];
        let events: ReadonlyArray<string>;
        if (type === undefined) events = textStream("I added the three sections.");
        else {
          const messages = readMessages(request.inputs["messages"]);
          const after =
            step === 0
              ? firstAfter
              : section === 0
                ? null
                : readResult(messages.at(-1)).content.block;
          events = sectionCall(after, type, step);
        }
        return new Response(eventStream(events), {
          headers: { "content-type": "text/event-stream" },
        });
      },
      { brand: "brand_harbour", site: "site_harbour", person: "user_sam" },
      "edit",
    );
    const status = yield* runTurn({
      chat: yield* Chat.empty,
      system: systemPrompt(contracts, emptyVoiceGuide, null),
      message: "Add a generic homepage with three sections.",
      afterStep: Effect.void,
    }).pipe(Effect.provide(Layer.merge(layer, model)));
    return { state, sent, status };
  });

it.effect("inserts first on an empty homepage, then after each returned section ID", () =>
  Effect.gen(function* () {
    const { state, sent, status } = yield* buildHome(null);
    const page = state.draft.pages[home];
    expect(status).toBe("done");
    expect(page?.root.map((id) => page.blocks[id]?.type)).toEqual([
      "hero",
      "feature-grid",
      "call-to-action",
    ]);
    expect(state.draft.parts).toEqual(harbourDraft.parts);
    expect(sent[0]?.inputs["tools"]).toContainEqual(
      expect.objectContaining({
        function: expect.objectContaining({
          name: "insert_section",
          parameters: expect.objectContaining({
            required: expect.arrayContaining(["after"]),
            properties: expect.objectContaining({
              after: expect.objectContaining({
                anyOf: expect.arrayContaining([{ type: "null" }]),
                description: expect.stringContaining("JSON null to insert first"),
              }),
            }),
          }),
        }),
      }),
    );
  }),
);

for (const [name, after] of [
  ["omitted", undefined],
  ["an empty string", ""],
  ["the string null", "null"],
] as const) {
  it.effect(`can repair after when it is ${name}, then build the empty homepage in order`, () =>
    Effect.gen(function* () {
      const { state, sent, status } = yield* buildHome(after);
      expect(status).toBe("done");
      expect(JSON.stringify(sent[1]?.inputs["messages"])).toContain(
        "Supply after: null to insert first, including on an empty page, or an existing block ID",
      );
      const page = state.draft.pages[home];
      expect(page?.root.map((id) => page.blocks[id]?.type)).toEqual([
        "hero",
        "feature-grid",
        "call-to-action",
      ]);
      expect(state.parts.filter((part) => part._tag === "Activity" && part.changed)).toHaveLength(
        3,
      );
    }),
  );
}
