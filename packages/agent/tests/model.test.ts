import { expect, it } from "@effect/vitest";
import { Effect, Schema, Stream } from "effect";
import { LanguageModel, Tool, Toolkit } from "effect/ai";

import { languageModel, type ModelRequest } from "../src/model.ts";
import { eventStream, textStream, toolCallStream } from "./support/workers-ai.ts";

const SetHeading = Tool.make("set_heading", {
  parameters: Schema.Struct({ block: Schema.String, heading: Schema.String }),
  success: Schema.Struct({ ok: Schema.Boolean }),
});
const tools = Toolkit.make(SetHeading);
const handlers = tools.toLayer({ set_heading: () => Effect.succeed({ ok: true }) });

const tags = { brand: "brand_harbour", site: "site_harbour", person: "user_sam" };

/** The edit model over a stand-in AI Gateway that streams `events` and keeps each request. */
const gateway = (events: ReadonlyArray<string>) => {
  const sent: Array<ModelRequest> = [];
  const model = languageModel(
    async (request) => {
      sent.push(request);
      return new Response(eventStream(events), {
        headers: { "content-type": "text/event-stream" },
      });
    },
    tags,
    "edit",
  );
  return { sent, model };
};

const setHeading = LanguageModel.streamText({
  prompt: "Set the hero heading to 'Hello there'.",
  toolkit: tools,
}).pipe(Stream.runCollect);

it.effect("asks Workers AI's edit model for low reasoning effort, tagged for cost tracking", () =>
  Effect.gen(function* () {
    const { sent, model } = gateway(toolCallStream);
    yield* setHeading.pipe(Effect.provide(model));
    expect(sent).toMatchObject([
      {
        model: "@cf/zai-org/glm-5.3-flash",
        inputs: { stream: true, reasoning_effort: "low" },
        tags: { ...tags, task: "edit" },
      },
    ]);
  }).pipe(Effect.provide(handlers)),
);

it.effect("a tool call streamed by Workers AI reaches the agent whole, with its token counts", () =>
  Effect.gen(function* () {
    const parts = yield* setHeading.pipe(Effect.provide(gateway(toolCallStream).model));
    expect(parts.filter((part) => part.type === "tool-call").map((part) => part.params)).toEqual([
      { block: "b_hero", heading: "Hello there" },
    ]);
    expect(parts.find((part) => part.type === "finish")).toMatchObject({
      reason: "tool-calls",
      usage: { inputTokens: { total: 172, cacheRead: 64 }, outputTokens: { total: 19 } },
    });
  }).pipe(Effect.provide(handlers)),
);

it.effect("replies streamed at once keep their text whole, even split within a character", () =>
  Effect.gen(function* () {
    const replies = ["é".repeat(60), "ü".repeat(60)];
    const read = (text: string) =>
      LanguageModel.streamText({ prompt: "Say something." }).pipe(
        Stream.runCollect,
        Effect.map((parts) =>
          parts.flatMap((part) => (part.type === "text-delta" ? [part.delta] : [])).join(""),
        ),
        Effect.provide(gateway(textStream(text)).model),
      );
    expect(yield* Effect.forEach(replies, read, { concurrency: "unbounded" })).toEqual(replies);
  }),
);
