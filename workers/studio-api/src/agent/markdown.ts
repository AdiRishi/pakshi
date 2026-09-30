import type { StudioApiEnv } from "@repo/infra/worker-bindings";

/**
 * A document as Markdown, converted by Workers AI through the stage's AI
 * Gateway, or why it couldn't be.
 */
export const toMarkdown = async (
  env: StudioApiEnv,
  document: { readonly name: string; readonly blob: Blob },
): Promise<
  { readonly ok: true; readonly markdown: string } | { readonly ok: false; readonly reason: string }
> => {
  const converted = await env.AI.toMarkdown(document, { gateway: { id: env.AI_GATEWAY } });
  return converted.format === "error"
    ? { ok: false, reason: converted.error }
    : { ok: true, markdown: converted.data };
};
