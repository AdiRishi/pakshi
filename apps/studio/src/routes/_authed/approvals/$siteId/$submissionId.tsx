import { createFileRoute } from "@tanstack/react-router";

import { reviewQuery } from "@/features/approvals/queries";
import { ReviewPage } from "@/features/approvals/review-page";
import { loadSite, siteParams, submissionParams } from "@/features/sites/site-route";

export const Route = createFileRoute("/_authed/approvals/$siteId/$submissionId")({
  params: {
    parse: (params) => ({ ...siteParams.parse(params), ...submissionParams.parse(params) }),
    stringify: (params) => ({
      ...siteParams.stringify(params),
      ...submissionParams.stringify(params),
    }),
  },
  loader: ({ context, params }) =>
    loadSite(() => context.queryClient.query(reviewQuery(params.siteId, params.submissionId))),
  component: function Review() {
    const { siteId, submissionId } = Route.useParams();
    return <ReviewPage site={siteId} submission={submissionId} />;
  },
});
