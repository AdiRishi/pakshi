import { BrandId } from "@repo/contracts/ids";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { Option, Schema } from "effect";

import { loadSite } from "@/features/sites/site-route";
import { workflowQuery } from "@/features/workflows/workflow-editor";
import { ScopeWorkflowPage } from "@/features/workflows/workflow-page";

export const Route = createFileRoute("/_authed/brands/$brandId/workflow")({
  params: {
    parse: (params) => {
      const brandId = Schema.decodeOption(BrandId)(params.brandId);
      if (Option.isNone(brandId)) throw notFound();
      return { brandId: brandId.value };
    },
    stringify: (params) => ({ brandId: params.brandId }),
  },
  loader: ({ context, params }) =>
    loadSite(() => context.queryClient.query(workflowQuery({ kind: "brand", id: params.brandId }))),
  component: function BrandWorkflow() {
    return (
      <ScopeWorkflowPage
        viewer={Route.useRouteContext().viewer}
        scope={{ kind: "brand", id: Route.useParams().brandId }}
      />
    );
  },
});
