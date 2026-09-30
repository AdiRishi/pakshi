import { expect, it } from "@effect/vitest";
import { Effect, Schema, Stream } from "effect";
import { LanguageModel, Tool, Toolkit } from "effect/unstable/ai";

import { languageModel, type ModelRequest, openAiStream } from "../src/model.ts";
import { eventStream, textStream, toolCallStream } from "./support/workers-ai.ts";

const SetHeading = Tool.make("set_heading", {
  parameters: Schema.Struct({ block: Schema.String, heading: Schema.String }),
  success: Schema.Struct({ ok: Schema.Boolean }),
});
const tools = Toolkit.make(SetHeading);
const handlers = tools.toLayer({ set_heading: () => Effect.succeed({ ok: true }) });

/** The part of an OpenAI chunk that carries the reply's text. */
const Chunk = Schema.Struct({
  choices: Schema.Array(
    Schema.Struct({ delta: Schema.Struct({ content: Schema.optional(Schema.String) }) }),
  ),
});

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

it("streams read at once keep their text whole, even split within a character", async () => {
  const replies = ["é".repeat(60), "ü".repeat(60)];
  const read = async (text: string) => {
    const events = (await new Response(openAiStream(eventStream(textStream(text)))).text())
      .split("\n\n")
      .map((event) => event.replace(/^data: /, ""))
      .filter((data) => data !== "" && data !== "[DONE]");
    return events
      .map((data) => Schema.decodeUnknownSync(Chunk)(JSON.parse(data)))
      .flatMap((chunk) => chunk.choices.map((choice) => choice.delta.content ?? ""))
      .join("");
  };
  expect(await Promise.all(replies.map(read))).toEqual(replies);
});
