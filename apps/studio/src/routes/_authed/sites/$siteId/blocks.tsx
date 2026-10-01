import { createFileRoute } from "@tanstack/react-router";

import { siteBlocksQuery } from "@/features/blocks/queries";
import { SiteBlocksPage } from "@/features/blocks/site-blocks-page";
import { loadSite, siteParams } from "@/features/sites/site-route";

export const Route = createFileRoute("/_authed/sites/$siteId/blocks")({
  params: siteParams,
  loader: ({ context, params }) =>
    loadSite(() => context.queryClient.query(siteBlocksQuery(params.siteId))),
  component: function SiteBlocks() {
    return (
      <SiteBlocksPage viewer={Route.useRouteContext().viewer} site={Route.useParams().siteId} />
    );
  },
});
