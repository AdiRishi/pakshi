import { createFileRoute } from "@tanstack/react-router";

import { DraftsPage } from "@/features/drafts/drafts-page";
import { siteDraftsQuery } from "@/features/sites/queries";
import { loadSite, siteParams } from "@/features/sites/site-route";

export const Route = createFileRoute("/_authed/sites/$siteId/")({
  params: siteParams,
  loader: ({ context, params }) =>
    loadSite(() => context.queryClient.query(siteDraftsQuery(params.siteId))),
  component: function SiteDrafts() {
    return <DraftsPage viewer={Route.useRouteContext().viewer} site={Route.useParams().siteId} />;
  },
});
