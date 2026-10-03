import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai-compat";
import { Effect, Layer, Option, Schema } from "effect";
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http";

/*
 * The agent reaches models through Effect's OpenAI-compatible provider. Its
 * requests go to Workers AI through AI Gateway: from a Worker over the AI
 * binding, and from Node, for evals, over the gateway's REST endpoint. Both
 * send Workers AI's own inputs for a model, which for chat models are
 * OpenAI's.
 */

/** The models the agent uses, by task. The platform team chooses them; people never do. */
export const models = {
  /** Planning, writing and editing pages: every turn of a conversation. */
  edit: { model: "@cf/zai-org/glm-5.3-flash", reasoningEffort: "low" },
  /** Alt text for an image, which needs a model that sees. */
  describe: { model: "@cf/zai-org/glm-5.3-flash", reasoningEffort: "low" },
  /** A merged value for a text field both sides of a merge changed. */
  merge: { model: "@cf/zai-org/glm-5.3-flash", reasoningEffort: "low" },
} as const satisfies Record<string, ModelChoice>;

export interface ModelChoice {
  readonly model: string;
  /**
   * GLM models reason at their highest effort unless asked otherwise, which
   * makes routine calls slow enough for Workers AI to time them out.
   */
  readonly reasoningEffort: "low" | "medium" | "high";
}

export type Task = keyof typeof models;

/** The most a model call may write, reasoning included. */
const maxOutputTokens = 16_384;

/**
 * What AI Gateway records with each request, for cost tracking. The gateway
 * keeps five entries at most.
 */
export type CostTags = Readonly<Record<"brand" | "site" | "person" | "task", string>>;

/** A model call as Workers AI takes it: the model, and its inputs. */
export interface ModelRequest {
  readonly model: string;
  readonly inputs: Schema.JsonObject;
  readonly tags: CostTags;
  readonly signal: AbortSignal;
}

/** Sends a model call through AI Gateway and returns the gateway's response as it is. */
export type SendToModel = (request: ModelRequest) => Promise<Response>;

const encoder = new TextEncoder();

/** A request the provider makes: Workers AI's inputs for a model, with the model's name. */
const ModelCall = Schema.fromJsonString(
  Schema.StructWithRest(Schema.Struct({ model: Schema.String }), [Schema.JsonObject]),
);
const decodeCall = Schema.decodeUnknownSync(ModelCall);

/** An event of Workers AI's stream: an OpenAI chunk, or the turn's token counts on their own. */
const WorkersAiEvent = Schema.fromJsonString(
  Schema.Union([
    Schema.StructWithRest(
      Schema.Struct({
        id: Schema.String,
        model: Schema.String,
        created: Schema.Finite,
        choices: Schema.Array(Schema.Json),
      }),
      [Schema.JsonObject],
    ),
    Schema.Struct({ usage: Schema.JsonObject }),
  ]),
);
const decodeEvent = Schema.decodeUnknownOption(WorkersAiEvent);

/** Leaves out the nulls Workers AI sends where OpenAI leaves a field out. Text content may be null. */
const withoutNulls = (key: string, value: Schema.Json) =>
  value === null && key !== "content" ? undefined : value;

/**
 * One event of Workers AI's stream as a strict OpenAI chunk. Workers AI sends
 * null for fields OpenAI leaves out, token counts on every chunk, and the
 * turn's totals in a last event of its own, none of which the provider's
 * parser accepts.
 */
const toOpenAiEvent = (
  data: string,
  last: { id: string; model: string; created: number },
): Option.Option<string> => {
  if (data === "[DONE]") return Option.some(data);
  return Option.map(decodeEvent(data), (event) => {
    if (!("choices" in event)) return JSON.stringify({ ...last, choices: [], usage: event.usage });
    last.id = event.id;
    last.model = event.model;
    last.created = event.created;
    const { usage: _, ...chunk } = event;
    return JSON.stringify(chunk, withoutNulls);
  });
};

/** Workers AI's server-sent events rewritten as OpenAI's. */
export const openAiStream = (body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> => {
  const last = { id: "", model: "", created: 0 };
  const decoder = new TextDecoder();
  let buffer = "";
  const emit = (controller: TransformStreamDefaultController<Uint8Array>, event: string) => {
    const data = event.startsWith("data:") ? event.slice(5).trim() : null;
    if (data === null || data.length === 0) return;
    for (const rewritten of Option.toArray(toOpenAiEvent(data, last)))
      controller.enqueue(encoder.encode(`data: ${rewritten}\n\n`));
  };
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";
        for (const event of events) emit(controller, event);
      },
      flush(controller) {
        emit(controller, buffer);
      },
    }),
  );
};

/**
 * The HTTP client the OpenAI-compatible provider sends through: each request
 * becomes a model call through AI Gateway, tagged for cost tracking.
 */
export const gatewayClient = (send: SendToModel, tags: Omit<CostTags, "task">, task: Task) =>
  HttpClient.make((request, _url, signal) =>
    Effect.tryPromise({
      try: async () => {
        const body = request.body;
        if (body._tag !== "Uint8Array") throw new Error("A model call carries a JSON body.");
        const { model, ...inputs } = decodeCall(new TextDecoder().decode(body.body));
        const response = await send({
          model,
          inputs,
          tags: { ...tags, task },
          signal,
        });
        return inputs["stream"] === true && response.ok && response.body !== null
          ? new Response(openAiStream(response.body), response)
          : response;
      },
      catch: (cause) =>
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({ request, cause }),
        }),
    }).pipe(Effect.map((response) => HttpClientResponse.fromWeb(request, response))),
  );

/** The language model for a task, reached through AI Gateway. */
export const languageModel = (send: SendToModel, tags: Omit<CostTags, "task">, task: Task) => {
  const choice = models[task];
  return OpenAiLanguageModel.layer({
    model: choice.model,
    // Workers AI's own default cuts long answers, such as a site plan, short.
    config: {
      reasoning_effort: choice.reasoningEffort,
      max_output_tokens: maxOutputTokens,
      strictJsonSchema: false,
    },
  }).pipe(
    Layer.provide(OpenAiClient.layer({ apiUrl: "https://workers-ai.invalid/v1" })),
    Layer.provide(Layer.succeed(HttpClient.HttpClient)(gatewayClient(send, tags, task))),
  );
};
