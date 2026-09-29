import { createFileRoute, redirect } from "@tanstack/react-router";

import { NotFoundPage } from "@/features/home/not-found-page";
import { getViewer } from "@/features/session/functions";

/** Every page for a signed-in person. Anyone else goes to sign-in before a child route loads. */
export const Route = createFileRoute("/_authed")({
  beforeLoad: async () => {
    const viewer = await getViewer();
    if (viewer === null) throw redirect({ to: "/sign-in" });
    return { viewer };
  },
  headers: () => ({ "Cache-Control": "private, no-store" }),
  notFoundComponent: function AuthedNotFound() {
    return <NotFoundPage viewer={Route.useRouteContext().viewer} />;
  },
});
