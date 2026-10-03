import { createCloudflareText } from "@tanstack/ai-cloudflare";
import { Schema } from "effect";

/*
 * The agent reaches Workers AI through the stage's AI Gateway: from a Worker
 * over the AI binding, and from Node, for evals, over the REST API.
 */

/** The models the agent uses, by task. The platform team chooses them; people never do. */
export const models = {
  /** Planning, writing and editing pages: every turn of a conversation. */
  edit: "@cf/zai-org/glm-5.3-flash",
  /** Alt text for an image, which needs a model that sees. */
  describe: "@cf/zai-org/glm-5.3-flash",
  /** A merged value for a text field both sides of a merge changed. */
  merge: "@cf/zai-org/glm-5.3-flash",
} as const satisfies Record<string, string>;

export type Task = keyof typeof models;

/**
 * What every call asks of the model. GLM models reason at their highest
 * effort unless asked otherwise, which makes routine calls slow enough for
 * Workers AI to time them out, and Workers AI's own output limit cuts long
 * answers, such as a site plan, short.
 */
export const modelOptions = { reasoning_effort: "low", max_tokens: 16_384 } as const;

/**
 * What AI Gateway records with each request, for cost tracking. The gateway
 * keeps five entries at most.
 */
export type CostTags = Readonly<Record<"brand" | "site" | "person" | "task", string>>;

/** The AI gateway a call goes through, and what it records with it. */
interface Gateway {
  readonly id: string;
  readonly metadata: CostTags;
}

/** The AI binding, as the agent calls it: a model by name, with Workers AI's inputs for it. */
export interface AiBinding {
  run(
    model: string,
    inputs: Schema.JsonObject,
    options: { gateway: Gateway; returnRawResponse: true },
  ): Promise<Response>;
}

/** How a call reaches Workers AI: the AI binding in a Worker, or an account's REST API. */
export type WorkersAi =
  | { readonly binding: AiBinding }
  | { readonly accountId: string; readonly apiKey: string };

/** A request of the OpenAI-compatible client: Workers AI's inputs for a model, with the model's name. */
const ModelCall = Schema.fromJsonString(
  Schema.StructWithRest(Schema.Struct({ model: Schema.String }), [Schema.JsonObject]),
);
const decodeCall = Schema.decodeUnknownSync(ModelCall);

/**
 * Sends the OpenAI-compatible client's requests over the AI binding instead
 * of HTTP, through the gateway, and cancelled with the request. The
 * adapter's own binding mode drops the cancellation, and types the binding
 * with its own copy of the Workers types, which ours don't match.
 */
const overBinding =
  (binding: AiBinding, gateway: Gateway) =>
  async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const { model, ...inputs } = decodeCall(init?.body);
    const answering = binding.run(model, inputs, { gateway, returnRawResponse: true });
    const signal = init?.signal;
    if (signal === undefined || signal === null) return answering;
    // Cancelling the request cancels Workers AI's answer, as a fetch's would:
    // the wait for it to start, and its stream once it has.
    const { promise: cancelled, reject } = Promise.withResolvers<never>();
    let started = false;
    const cancel = () => {
      reject(signal.reason);
      // An answer that starts after the request was cancelled is never read.
      if (!started)
        answering.then((response) => response.body?.cancel(signal.reason)).catch(() => undefined);
    };
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
    const response = await Promise.race([answering, cancelled]);
    started = true;
    if (response.body === null) return response;
    return new Response(response.body.pipeThrough(new TransformStream(), { signal }), response);
  };

/** The language model for a task, reached through AI Gateway and tagged for cost tracking. */
export const languageModel = (
  workersAi: WorkersAi,
  gateway: string,
  tags: Omit<CostTags, "task">,
  task: Task,
) => {
  const through = { id: gateway, metadata: { ...tags, task } };
  return createCloudflareText(models[task], {
    ...("binding" in workersAi
      ? {
          // The binding authenticates the call; the client only needs an account and a key to exist.
          accountId: "binding",
          apiKey: "binding",
          fetch: overBinding(workersAi.binding, through),
        }
      : { ...workersAi, gateway: through }),
    // Every tool schema is open, as Effect writes them, so the warning is noise.
    strictFallbackWarning: false,
  });
};

export type LanguageModel = ReturnType<typeof languageModel>;
