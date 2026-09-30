import type { SendToModel } from "@repo/agent";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";

/**
 * Sends the agent's model calls to Workers AI through the stage's AI
 * Gateway, which logs each with its cost tags and enforces the product's
 * spend limit. The binding authenticates the call.
 */
export const sendThroughGateway =
  (env: StudioApiEnv): SendToModel =>
  async ({ model, inputs, tags, signal }) => {
    // Models are chosen by name in configuration, which the binding's types
    // can't match to a model, so they don't know a raw response is asked for.
    const response = await env.AI.run(model, inputs, {
      gateway: { id: env.AI_GATEWAY, metadata: tags },
      returnRawResponse: true,
      signal,
    });
    if (!(response instanceof Response)) throw new Error("Workers AI didn't return its response.");
    return response;
  };
