import { Option, Predicate, Schema } from "effect";

import { languageModel } from "../../src/model.ts";

/** A reply the scripted model streams: text, tool calls, or an HTTP error, such as AI Gateway's 429. */
export type Reply =
  | { readonly text: string }
  | { readonly calls: ReadonlyArray<{ readonly name: string; readonly params: unknown }> }
  | { readonly fail: number };

/** What the agent sent Workers AI for one model call. */
const ModelRequest = Schema.Struct({
  messages: Schema.Array(Schema.Struct({ role: Schema.String, content: Schema.Json })),
  tools: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({ function: Schema.Struct({ name: Schema.String, parameters: Schema.Json }) }),
    ),
  ),
  reasoning_effort: Schema.optionalKey(Schema.String),
});
export type ModelRequest = typeof ModelRequest.Type;
const decodeRequest = Schema.decodeUnknownSync(ModelRequest);

/** What a chunk of Workers AI's stream adds to the reply. */
interface Delta {
  readonly role: "assistant";
  readonly content: string;
  readonly tool_calls?: ReadonlyArray<{
    readonly index: number;
    readonly id: string;
    readonly type: "function";
    readonly function: { readonly name: string; readonly arguments: string };
  }>;
}

const chunk = (delta: Delta, finish: string | null) =>
  JSON.stringify({
    choices: [{ delta, finish_reason: finish, index: 0 }],
    created: 1790788667,
    id: "chat_1",
    model: "@cf/zai-org/glm-5.3-flash",
    object: "chat.completion.chunk",
  });

const events = (reply: Exclude<Reply, { fail: number }>, step: number) =>
  "text" in reply
    ? [chunk({ role: "assistant", content: reply.text }, "stop")]
    : [
        chunk(
          {
            role: "assistant",
            content: "",
            tool_calls: reply.calls.map((call, index) => ({
              index,
              id: `call${step}_${index}`,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.params) },
            })),
          },
          "tool_calls",
        ),
      ];

/**
 * The AI binding replying from a script, one reply per model call, or with
 * whatever `script` makes of each request, under the same model the agent
 * uses in a Worker, and recording what it was asked. When a script runs out,
 * it answers "Done."
 */
export const scriptedModel = (
  script: ReadonlyArray<Reply> | ((request: ModelRequest, step: number) => Reply),
) => {
  const requests: Array<ModelRequest> = [];
  const reply = Predicate.isFunction(script)
    ? script
    : (_request: ModelRequest, step: number): Reply => script[step] ?? { text: "Done." };
  const model = languageModel(
    {
      binding: {
        run: async (_model, inputs) => {
          const request = decodeRequest(inputs);
          requests.push(request);
          const answer = reply(request, requests.length - 1);
          if ("fail" in answer)
            return Response.json(
              { errors: [{ code: 2003, message: "Rate limited" }] },
              { status: answer.fail },
            );
          const body = [...events(answer, requests.length), "[DONE]"]
            .map((event) => `data: ${event}\n\n`)
            .join("");
          return new Response(body, { headers: { "content-type": "text/event-stream" } });
        },
      },
    },
    "gateway_test",
    { brand: "brand_test", site: "site_test", person: "user_sam" },
    "edit",
  );
  return { model, requests };
};

const Refusal = Schema.fromJsonString(Schema.Struct({ error: Schema.String }));
const readRefusal = Schema.decodeUnknownOption(Refusal);

/** What the model was told about the tool calls it got wrong, by the time of `request`. */
export const refusalsIn = (request: ModelRequest | undefined) =>
  (request?.messages ?? []).flatMap((message) =>
    message.role === "tool"
      ? Option.toArray(readRefusal(message.content)).map((found) => found.error)
      : [],
  );
