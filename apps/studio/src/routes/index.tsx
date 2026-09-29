import { createFileRoute, redirect } from "@tanstack/react-router";

import { HomePage } from "@/features/home/page";
import { getViewer } from "@/features/session/functions";

export const Route = createFileRoute("/")({
  loader: async () => {
    const viewer = await getViewer();
    if (viewer === null) throw redirect({ to: "/sign-in" });
    return viewer;
  },
  component: function Home() {
    return <HomePage viewer={Route.useLoaderData()} />;
  },
});
