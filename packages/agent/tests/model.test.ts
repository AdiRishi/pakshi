import { chat, toolDefinition, type UsageInfo } from "@tanstack/ai";
import { Schema } from "effect";
import { expect, it } from "vitest";

import { type AiBinding, languageModel, modelOptions } from "../src/model.ts";
import { eventStream, textStream, toolCallStream } from "./support/workers-ai.ts";

const tags = { brand: "brand_harbour", site: "site_harbour", person: "user_sam" };

/** The edit model over a stand-in AI binding that streams `events` and keeps each call. */
const workersAi = (events: ReadonlyArray<string>) => {
  const calls: Array<Parameters<AiBinding["run"]>> = [];
  const model = languageModel(
    {
      binding: {
        run: async (...call) => {
          calls.push(call);
          return new Response(eventStream(events), {
            headers: { "content-type": "text/event-stream" },
          });
        },
      },
    },
    "gateway_harbour",
    tags,
    "edit",
  );
  return { calls, model };
};

const setHeading = toolDefinition({
  name: "set_heading",
  description: "Sets a block's heading",
  inputSchema: Schema.toStandardJSONSchemaV1(
    Schema.Struct({ block: Schema.String, heading: Schema.String }),
  ),
});

it("asks Workers AI's edit model for low reasoning effort, through AI Gateway, tagged for cost tracking", async () => {
  const { calls, model } = workersAi(textStream("Hello."));
  await chat({
    adapter: model,
    messages: [{ role: "user", content: "Hi" }],
    modelOptions,
    stream: false,
  });
  expect(calls).toMatchObject([
    [
      "@cf/zai-org/glm-5.3-flash",
      { stream: true, reasoning_effort: "low" },
      {
        gateway: { id: "gateway_harbour", metadata: { ...tags, task: "edit" } },
        returnRawResponse: true,
      },
    ],
  ]);
});

it("a tool call streamed by Workers AI reaches the agent whole, with its token counts", async () => {
  const { model } = workersAi(toolCallStream);
  const inputs: Array<unknown> = [];
  const usage: Array<UsageInfo> = [];
  await chat({
    adapter: model,
    messages: [{ role: "user", content: "Set the hero heading to 'Hello there'." }],
    tools: [
      setHeading.server(async (input) => {
        inputs.push(input);
        return { ok: true };
      }),
    ],
    agentLoopStrategy: () => false,
    middleware: [{ onUsage: (_ctx, found) => void usage.push(found) }],
    stream: false,
  });
  expect(inputs).toEqual([{ block: "b_hero", heading: "Hello there" }]);
  expect(usage).toMatchObject([{ promptTokens: 172, completionTokens: 19 }]);
});

it("replies streamed at once keep their text whole, even split within a character", async () => {
  const text = "Plané, sail and launch 🚤 on the harbour.";
  const { model } = workersAi(textStream(text));
  expect(
    await chat({ adapter: model, messages: [{ role: "user", content: "Hi" }], stream: false }),
  ).toBe(text);
});

it("a stopped turn cancels the model's call rather than waiting for it", async () => {
  const stop = new AbortController();
  let cancelled = false;
  // A model that streams nothing until it's cancelled.
  const model = languageModel(
    {
      binding: {
        run: async () =>
          new Response(
            new ReadableStream({
              cancel() {
                cancelled = true;
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          ),
      },
    },
    "gateway_harbour",
    tags,
    "edit",
  );
  const turn = chat({
    adapter: model,
    messages: [{ role: "user", content: "Hi" }],
    abortController: stop,
    stream: false,
  }).catch(() => "");
  await new Promise((resolve) => setTimeout(resolve, 10));
  stop.abort();
  await turn;
  expect(cancelled).toBe(true);
});

it("a stopped turn doesn't wait for Workers AI to start answering", async () => {
  const stop = new AbortController();
  const { promise: answered, resolve: answer } = Promise.withResolvers<Response>();
  let cancelled = false;
  const model = languageModel(
    { binding: { run: () => answered } },
    "gateway_harbour",
    tags,
    "edit",
  );
  const turn = chat({
    adapter: model,
    messages: [{ role: "user", content: "Hi" }],
    abortController: stop,
    stream: false,
  }).catch(() => "");
  await new Promise((resolve) => setTimeout(resolve, 10));
  stop.abort();
  await turn;
  // The answer that comes after all is cancelled rather than read.
  answer(
    new Response(new ReadableStream({ cancel: () => void (cancelled = true) }), {
      headers: { "content-type": "text/event-stream" },
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(cancelled).toBe(true);
});
