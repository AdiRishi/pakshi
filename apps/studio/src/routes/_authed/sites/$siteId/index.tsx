import { createFileRoute } from "@tanstack/react-router";

import { PagesPage } from "@/features/sites/pages-page";
import { sitePagesQuery } from "@/features/sites/queries";
import { loadSite, siteParams } from "@/features/sites/site-route";

export const Route = createFileRoute("/_authed/sites/$siteId/")({
  params: siteParams,
  loader: ({ context, params }) =>
    loadSite(() => context.queryClient.query(sitePagesQuery(params.siteId))),
  component: function SitePages() {
    return <PagesPage viewer={Route.useRouteContext().viewer} site={Route.useParams().siteId} />;
  },
});
