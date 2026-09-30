import type { SendToModel } from "@repo/agent";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";

/**
 * Sends the agent's model calls to Workers AI through the stage's AI
 * Gateway, which logs each with its cost tags and enforces the product's
 * spend limit. The binding authenticates the call.
 */
export const sendThroughGateway =
  (env: StudioApiEnv): SendToModel =>
  ({ model, inputs, tags, signal }) =>
    env.AI.gateway(env.AI_GATEWAY).run(
      {
        provider: "workers-ai",
        endpoint: model,
        headers: { "Content-Type": "application/json", "cf-aig-metadata": tags },
        query: inputs,
      },
      { signal },
    );
