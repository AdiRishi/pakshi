import { createFileRoute } from "@tanstack/react-router";

import { ReleasesPage } from "@/features/releases/releases-page";
import { siteReleasesQuery } from "@/features/sites/queries";
import { loadSite, siteParams } from "@/features/sites/site-route";

export const Route = createFileRoute("/_authed/sites/$siteId/releases")({
  params: siteParams,
  loader: ({ context, params }) =>
    loadSite(() => context.queryClient.query(siteReleasesQuery(params.siteId))),
  component: function SiteReleases() {
    return <ReleasesPage viewer={Route.useRouteContext().viewer} site={Route.useParams().siteId} />;
  },
});
