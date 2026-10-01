import { createFileRoute } from "@tanstack/react-router";

import { MetricsPage, periodStart } from "@/features/metrics/metrics-page";
import { successMetricsQuery } from "@/features/metrics/queries";

export const Route = createFileRoute("/_authed/metrics")({
  loader: ({ context }) => context.queryClient.query(successMetricsQuery(periodStart("quarter"))),
  head: () => ({ meta: [{ title: "Metrics · Pakshi" }] }),
  component: function Metrics() {
    return <MetricsPage viewer={Route.useRouteContext().viewer} />;
  },
});
