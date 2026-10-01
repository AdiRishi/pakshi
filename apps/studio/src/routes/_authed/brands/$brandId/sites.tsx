import { createFileRoute } from "@tanstack/react-router";

import { BrandSitesPage } from "@/features/brands/brands-page";
import { brandQuery } from "@/features/brands/queries";
import { brandParams, loadSite } from "@/features/sites/site-route";

export const Route = createFileRoute("/_authed/brands/$brandId/sites")({
  params: brandParams,
  loader: ({ context, params }) =>
    loadSite(() => context.queryClient.query(brandQuery(params.brandId))),
  component: function BrandSites() {
    return (
      <BrandSitesPage viewer={Route.useRouteContext().viewer} brand={Route.useParams().brandId} />
    );
  },
});
