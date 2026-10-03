import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

/** The page of a draft or submission that Studio's server entry chose for this request. */
export const getShownPreview = createServerFn({ method: "GET" }).handler(({ context }) => {
  if (context.preview === null) throw notFound();
  return context.preview;
});

export type ShownPreviewData = Awaited<ReturnType<typeof getShownPreview>>;
