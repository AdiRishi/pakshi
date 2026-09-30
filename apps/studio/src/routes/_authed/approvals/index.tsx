import { createFileRoute } from "@tanstack/react-router";

import { ApprovalsPage } from "@/features/approvals/approvals-page";
import { approvalsQuery } from "@/features/approvals/queries";

export const Route = createFileRoute("/_authed/approvals/")({
  loader: ({ context }) => context.queryClient.query(approvalsQuery),
  component: function Approvals() {
    return <ApprovalsPage viewer={Route.useRouteContext().viewer} />;
  },
});
