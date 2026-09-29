import { createFileRoute } from "@tanstack/react-router";

import { HomePage } from "@/features/home/page";

export const Route = createFileRoute("/_authed/")({
  component: function Home() {
    return <HomePage viewer={Route.useRouteContext().viewer} />;
  },
});
