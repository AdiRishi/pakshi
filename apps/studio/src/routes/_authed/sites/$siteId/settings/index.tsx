import { createFileRoute } from "@tanstack/react-router";

import { GeneralSettingsPage } from "@/features/settings/general-page";
import { siteSettingsQuery } from "@/features/sites/queries";
import { loadSite, siteParams } from "@/features/sites/site-route";

export const Route = createFileRoute("/_authed/sites/$siteId/settings/")({
  params: siteParams,
  loader: ({ context, params }) =>
    loadSite(() => context.queryClient.query(siteSettingsQuery(params.siteId))),
  component: function SiteSettings() {
    return (
      <GeneralSettingsPage
        viewer={Route.useRouteContext().viewer}
        site={Route.useParams().siteId}
      />
    );
  },
});
