import { createFileRoute } from "@tanstack/react-router";

import { PreviewDocument, previewHead } from "@/features/preview/document";
import { getShownPreview } from "@/features/preview/functions";

/** A page of a submission under review. Studio's server entry checks access and chooses it. */
export const Route = createFileRoute("/review/$siteId/$submissionId/$")({
  loader: () => getShownPreview(),
  head: ({ loaderData }) => previewHead(loaderData),
  component: function Review() {
    return <PreviewDocument data={Route.useLoaderData()} />;
  },
});
