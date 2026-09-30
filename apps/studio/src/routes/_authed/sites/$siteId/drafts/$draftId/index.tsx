import { createFileRoute } from "@tanstack/react-router";

import { DraftPage } from "@/features/drafts/draft-page";
import { draftPagesQuery } from "@/features/sites/queries";
import { draftParams, loadSite, siteParams } from "@/features/sites/site-route";

export const Route = createFileRoute("/_authed/sites/$siteId/drafts/$draftId/")({
  params: {
    parse: (params) => ({ ...siteParams.parse(params), ...draftParams.parse(params) }),
    stringify: (params) => ({ ...siteParams.stringify(params), ...draftParams.stringify(params) }),
  },
  loader: ({ context, params }) =>
    loadSite(() => context.queryClient.query(draftPagesQuery(params.siteId, params.draftId))),
  component: function Draft() {
    const { siteId, draftId } = Route.useParams();
    return <DraftPage viewer={Route.useRouteContext().viewer} site={siteId} draft={draftId} />;
  },
});
