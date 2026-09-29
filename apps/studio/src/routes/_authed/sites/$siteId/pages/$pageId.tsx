import { createFileRoute, notFound } from "@tanstack/react-router";

import { EditorPage } from "@/features/editor/editor-page";
import { editorDraftQuery } from "@/features/sites/queries";
import { loadSite, pageParams, siteParams } from "@/features/sites/site-route";

export const Route = createFileRoute("/_authed/sites/$siteId/pages/$pageId")({
  params: {
    parse: (params) => ({ ...siteParams.parse(params), ...pageParams.parse(params) }),
    stringify: (params) => ({ ...siteParams.stringify(params), ...pageParams.stringify(params) }),
  },
  // The editor renders on the client only.
  ssr: false,
  loader: async ({ context, params }) => {
    const { draft } = await loadSite(() =>
      context.queryClient.query(editorDraftQuery(params.siteId)),
    );
    if (!(params.pageId in draft.pages)) throw notFound();
  },
  component: function EditPage() {
    const { siteId, pageId } = Route.useParams();
    const { user } = Route.useRouteContext().viewer;
    return <EditorPage site={siteId} page={pageId} person={{ id: user.id, name: user.name }} />;
  },
});
