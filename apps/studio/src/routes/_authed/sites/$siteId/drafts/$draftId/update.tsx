import { createFileRoute } from "@tanstack/react-router";

import { draftUpdateQuery, UpdatePage } from "@/features/drafts/update-page";
import { draftParams, loadSite, siteParams } from "@/features/sites/site-route";

export const Route = createFileRoute("/_authed/sites/$siteId/drafts/$draftId/update")({
  params: {
    parse: (params) => ({ ...siteParams.parse(params), ...draftParams.parse(params) }),
    stringify: (params) => ({ ...siteParams.stringify(params), ...draftParams.stringify(params) }),
  },
  loader: ({ context, params }) =>
    loadSite(() => context.queryClient.query(draftUpdateQuery(params.siteId, params.draftId))),
  component: function UpdateDraft() {
    const { siteId, draftId } = Route.useParams();
    return <UpdatePage site={siteId} draft={draftId} />;
  },
});
