import { createFileRoute } from "@tanstack/react-router";

import { brandQuery } from "@/features/brands/queries";
import { ThemeStudio } from "@/features/brands/theme-studio";
import { brandParams, loadSite } from "@/features/sites/site-route";

export const Route = createFileRoute("/_authed/brands/$brandId/")({
  params: brandParams,
  loader: ({ context, params }) =>
    loadSite(() => context.queryClient.query(brandQuery(params.brandId))),
  component: function BrandTheme() {
    return (
      <ThemeStudio viewer={Route.useRouteContext().viewer} brand={Route.useParams().brandId} />
    );
  },
});
