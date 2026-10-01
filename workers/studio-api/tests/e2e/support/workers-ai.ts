import { WorkerEntrypoint } from "cloudflare:workers";

/**
 * Stands in for Workers AI, which runs only on Cloudflare's network. E2E
 * tests check what reaches the model, never what it says, so every call is
 * refused as the gateway refuses one over its spend limit.
 */
export class WorkersAi extends WorkerEntrypoint {
  run() {
    return Response.json({ error: "No model in E2E tests." }, { status: 429 });
  }

  toMarkdown() {
    return [];
  }
}

export default { fetch: () => new Response("Not found", { status: 404 }) };
