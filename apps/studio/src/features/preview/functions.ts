import { loadBlocks } from "@repo/blocks";
import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

/** The page of a draft or submission that Studio's server entry chose for this request. */
export const getShownPreview = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  if (context.preview === null) throw notFound();
  // Rendering waits for nothing once the page's block versions are loaded, so its HTML is whole.
  await loadBlocks(context.preview.view.lockfile);
  return context.preview;
});

export type ShownPreviewData = Awaited<ReturnType<typeof getShownPreview>>;
