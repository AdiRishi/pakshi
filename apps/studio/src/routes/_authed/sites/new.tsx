import { createFileRoute } from "@tanstack/react-router";

import { NewSitePage } from "@/features/sites/new-site-page";
import { newSiteOptionsQuery } from "@/features/sites/queries";

export const Route = createFileRoute("/_authed/sites/new")({
  loader: ({ context }) => context.queryClient.query(newSiteOptionsQuery),
  head: () => ({ meta: [{ title: "New site · Pakshi" }] }),
  component: function NewSite() {
    return <NewSitePage viewer={Route.useRouteContext().viewer} />;
  },
});
