import { createFileRoute } from "@tanstack/react-router";

import { DomainsPage, siteDomainsQuery } from "@/features/settings/domains-page";
import { loadSite, siteParams } from "@/features/sites/site-route";

export const Route = createFileRoute("/_authed/sites/$siteId/settings/domains")({
  params: siteParams,
  loader: ({ context, params }) =>
    loadSite(() => context.queryClient.query(siteDomainsQuery(params.siteId))),
  component: function SiteDomains() {
    return <DomainsPage viewer={Route.useRouteContext().viewer} site={Route.useParams().siteId} />;
  },
});
