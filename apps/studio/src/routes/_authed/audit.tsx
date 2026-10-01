import { createFileRoute } from "@tanstack/react-router";

import { AuditPage } from "@/features/audit/audit-page";
import { auditFiltersQuery } from "@/features/audit/queries";

export const Route = createFileRoute("/_authed/audit")({
  loader: ({ context }) => context.queryClient.query(auditFiltersQuery),
  head: () => ({ meta: [{ title: "Audit log · Pakshi" }] }),
  component: function Audit() {
    return <AuditPage viewer={Route.useRouteContext().viewer} />;
  },
});
