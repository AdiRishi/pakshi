import { createFileRoute } from "@tanstack/react-router";

import { FormsSettingsPage } from "@/features/settings/forms-page";
import { siteSettingsQuery } from "@/features/sites/queries";
import { loadSiteTab, siteParams } from "@/features/sites/site-route";

export const Route = createFileRoute("/_authed/sites/$siteId/settings/forms")({
  params: siteParams,
  loader: ({ context, params }) =>
    loadSiteTab(context.queryClient, params.siteId, () =>
      context.queryClient.query(siteSettingsQuery(params.siteId)),
    ),
  component: function FormsSettings() {
    return (
      <FormsSettingsPage viewer={Route.useRouteContext().viewer} site={Route.useParams().siteId} />
    );
  },
});
