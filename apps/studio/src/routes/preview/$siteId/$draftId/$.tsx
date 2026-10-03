import { createFileRoute } from "@tanstack/react-router";

import { PreviewDocument, previewHead } from "@/features/preview/document";
import { getShownPreview } from "@/features/preview/functions";

/** A page of a draft's preview. Studio's server entry checks access and chooses it. */
export const Route = createFileRoute("/preview/$siteId/$draftId/$")({
  loader: () => getShownPreview(),
  head: ({ loaderData }) => previewHead(loaderData),
  component: function Preview() {
    return <PreviewDocument data={Route.useLoaderData()} />;
  },
});
