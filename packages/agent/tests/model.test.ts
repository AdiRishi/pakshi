import { expect, it } from "@effect/vitest";
import { Effect, Schema, Stream } from "effect";
import { LanguageModel, Tool, Toolkit } from "effect/unstable/ai";

import { languageModel, type ModelRequest } from "../src/model.ts";
import { eventStream, toolCallStream } from "./support/workers-ai.ts";

const SetHeading = Tool.make("set_heading", {
  parameters: Schema.Struct({ block: Schema.String, heading: Schema.String }),
  success: Schema.Struct({ ok: Schema.Boolean }),
});
const tools = Toolkit.make(SetHeading);
const handlers = tools.toLayer({ set_heading: () => Effect.succeed({ ok: true }) });

const tags = { brand: "brand_harbour", site: "site_harbour", person: "user_sam" };

it.effect("a tool call streamed by Workers AI reaches the agent whole, with its token counts", () =>
  Effect.gen(function* () {
    const sent: Array<ModelRequest> = [];
    const model = languageModel(
      async (request) => {
        sent.push(request);
        return new Response(eventStream(toolCallStream), {
          headers: { "content-type": "text/event-stream" },
        });
      },
      tags,
      "edit",
    );
    const parts = yield* LanguageModel.streamText({
      prompt: "Set the hero heading to 'Hello there'.",
      toolkit: yield* tools,
    }).pipe(Stream.runCollect, Effect.provide(model));
    expect(parts.filter((part) => part.type === "tool-call").map((part) => part.params)).toEqual([
      { block: "b_hero", heading: "Hello there" },
    ]);
    expect(parts.find((part) => part.type === "finish")).toMatchObject({
      reason: "tool-calls",
      usage: { inputTokens: { total: 172, cacheRead: 64 }, outputTokens: { total: 19 } },
    });
    expect(sent).toMatchObject([
      {
        model: "@cf/zai-org/glm-5.3-flash",
        inputs: { stream: true, reasoning_effort: "low" },
        tags: { ...tags, task: "edit" },
      },
    ]);
  }).pipe(Effect.provide(handlers)),
);
