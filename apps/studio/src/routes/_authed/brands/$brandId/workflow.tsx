import { createFileRoute } from "@tanstack/react-router";

import { brandQuery } from "@/features/brands/queries";
import { brandParams, loadSite } from "@/features/sites/site-route";
import { workflowQuery } from "@/features/workflows/workflow-editor";
import { BrandWorkflowPage } from "@/features/workflows/workflow-page";

export const Route = createFileRoute("/_authed/brands/$brandId/workflow")({
  params: brandParams,
  loader: ({ context, params }) =>
    loadSite(() =>
      Promise.all([
        context.queryClient.query(workflowQuery({ kind: "brand", id: params.brandId })),
        context.queryClient.query(brandQuery(params.brandId)),
      ]),
    ),
  component: function BrandWorkflow() {
    return (
      <BrandWorkflowPage
        viewer={Route.useRouteContext().viewer}
        scope={{ kind: "brand", id: Route.useParams().brandId }}
      />
    );
  },
});
