import { createFileRoute } from "@tanstack/react-router";

import { SiteMembersPage } from "@/features/people/members-page";
import { scopeMembersQuery } from "@/features/people/queries";
import { loadSite, siteParams } from "@/features/sites/site-route";

export const Route = createFileRoute("/_authed/sites/$siteId/settings/members")({
  params: siteParams,
  loader: ({ context, params }) =>
    loadSite(() =>
      context.queryClient.query(scopeMembersQuery({ kind: "site", id: params.siteId })),
    ),
  head: () => ({ meta: [{ title: "Members · Pakshi" }] }),
  component: function SiteMembers() {
    return (
      <SiteMembersPage
        viewer={Route.useRouteContext().viewer}
        scope={{ kind: "site", id: Route.useParams().siteId }}
      />
    );
  },
});
