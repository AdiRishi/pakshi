import { createFileRoute } from "@tanstack/react-router";

import { ReleasesPage } from "@/features/releases/releases-page";
import { siteReleasesQuery } from "@/features/sites/queries";
import { loadSiteTab, siteParams } from "@/features/sites/site-route";

export const Route = createFileRoute("/_authed/sites/$siteId/releases")({
  params: siteParams,
  loader: ({ context, params }) =>
    loadSiteTab(context.queryClient, params.siteId, () =>
      context.queryClient.query(siteReleasesQuery(params.siteId)),
    ),
  component: function SiteReleases() {
    return <ReleasesPage viewer={Route.useRouteContext().viewer} site={Route.useParams().siteId} />;
  },
});
