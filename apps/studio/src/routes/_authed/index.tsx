import { createFileRoute } from "@tanstack/react-router";

import { homeQuery } from "@/features/approvals/queries";
import { HomePage } from "@/features/home/page";

export const Route = createFileRoute("/_authed/")({
  loader: ({ context }) => context.queryClient.query(homeQuery),
  component: function Home() {
    return <HomePage viewer={Route.useRouteContext().viewer} />;
  },
});
