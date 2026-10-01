import { createFileRoute } from "@tanstack/react-router";

import { MediaPage, mediaLibraryQuery } from "@/features/media/media-page";
import { loadSite, siteParams } from "@/features/sites/site-route";

export const Route = createFileRoute("/_authed/sites/$siteId/media")({
  params: siteParams,
  loader: ({ context, params }) =>
    loadSite(() => context.queryClient.query(mediaLibraryQuery(params.siteId))),
  component: function SiteMedia() {
    return <MediaPage viewer={Route.useRouteContext().viewer} site={Route.useParams().siteId} />;
  },
});
