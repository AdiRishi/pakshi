import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { EditorPage } from "@/features/editor/editor-page";
import { openDraft } from "@/features/sites/functions";
import { draftParams, loadSite, pageParams, siteParams } from "@/features/sites/site-route";

export const Route = createFileRoute("/_authed/sites/$siteId/drafts/$draftId/pages/$pageId")({
  params: {
    parse: (params) => ({
      ...siteParams.parse(params),
      ...draftParams.parse(params),
      ...pageParams.parse(params),
    }),
    stringify: (params) => ({
      ...siteParams.stringify(params),
      ...draftParams.stringify(params),
      ...pageParams.stringify(params),
    }),
  },
  // The editor renders on the client only.
  ssr: false,
  // Opening a draft brings it up to date with the live site, or sends it to its update.
  loader: async ({ params }) => {
    const opened = await loadSite(() =>
      openDraft({ data: { site: params.siteId, draft: params.draftId } }),
    );
    if (opened._tag === "NeedsUpdate")
      throw redirect({
        to: "/sites/$siteId/drafts/$draftId/update",
        params: { siteId: params.siteId, draftId: params.draftId },
      });
    if (!(params.pageId in opened.draft.pages)) throw notFound();
    return opened;
  },
  component: function EditPage() {
    const { siteId, draftId, pageId } = Route.useParams();
    const opened = Route.useLoaderData();
    const { user } = Route.useRouteContext().viewer;
    // Each page opens in an editor of its own.
    return (
      <EditorPage
        key={pageId}
        site={siteId}
        draft={draftId}
        page={pageId}
        person={{ id: user.id, name: user.name }}
        opened={opened}
      />
    );
  },
});
