import { createFileRoute } from "@tanstack/react-router";

import { loadSite } from "@/features/sites/site-route";
import { workflowQuery } from "@/features/workflows/workflow-editor";
import { OrganizationWorkflowPage } from "@/features/workflows/workflow-page";

export const Route = createFileRoute("/_authed/organization/workflow")({
  loader: ({ context }) =>
    loadSite(() => context.queryClient.query(workflowQuery({ kind: "organization" }))),
  component: function OrganizationWorkflow() {
    return (
      <OrganizationWorkflowPage
        viewer={Route.useRouteContext().viewer}
        scope={{ kind: "organization" }}
      />
    );
  },
});
