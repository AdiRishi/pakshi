import { createFileRoute } from "@tanstack/react-router";

import { IdentityVoicePage } from "@/features/brands/identity-voice";
import { brandQuery } from "@/features/brands/queries";
import { brandParams, loadSite } from "@/features/sites/site-route";

export const Route = createFileRoute("/_authed/brands/$brandId/identity")({
  params: brandParams,
  loader: ({ context, params }) =>
    loadSite(() => context.queryClient.query(brandQuery(params.brandId))),
  component: function BrandIdentity() {
    return (
      <IdentityVoicePage
        viewer={Route.useRouteContext().viewer}
        brand={Route.useParams().brandId}
      />
    );
  },
});
