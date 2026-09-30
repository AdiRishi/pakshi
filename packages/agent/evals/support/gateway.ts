import type { SendToModel } from "../../src/model.ts";

/** What the evals reach AI Gateway with, from the environment. */
const setting = (name: string) => {
  const value = process.env[name];
  if (value === undefined || value === "")
    throw new Error(`Set ${name} to run the evals. See packages/agent/evals/README.md.`);
  return value;
};

/**
 * Sends the agent's model calls to Workers AI through AI Gateway's REST
 * endpoint, as the evals run in Node. The same gateway logs them, tagged as
 * evals, so their cost is tracked apart from people's.
 */
export const restGateway = (): SendToModel => {
  const account = setting("CLOUDFLARE_ACCOUNT_ID");
  const token = setting("CLOUDFLARE_API_TOKEN");
  const gateway = setting("AI_GATEWAY_ID");
  return ({ model, inputs, tags, signal }) =>
    fetch(`https://gateway.ai.cloudflare.com/v1/${account}/${gateway}/workers-ai/${model}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "cf-aig-metadata": JSON.stringify(tags),
      },
      body: JSON.stringify(inputs),
      signal,
    });
};
