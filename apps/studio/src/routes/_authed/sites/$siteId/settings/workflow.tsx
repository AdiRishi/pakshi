import { createFileRoute } from "@tanstack/react-router";

import { loadSite, siteParams } from "@/features/sites/site-route";
import { workflowQuery } from "@/features/workflows/workflow-editor";
import { SiteWorkflowPage } from "@/features/workflows/workflow-page";

export const Route = createFileRoute("/_authed/sites/$siteId/settings/workflow")({
  params: siteParams,
  loader: ({ context, params }) =>
    loadSite(() => context.queryClient.query(workflowQuery({ kind: "site", id: params.siteId }))),
  component: function SiteWorkflow() {
    return (
      <SiteWorkflowPage
        viewer={Route.useRouteContext().viewer}
        scope={{ kind: "site", id: Route.useParams().siteId }}
      />
    );
  },
});
