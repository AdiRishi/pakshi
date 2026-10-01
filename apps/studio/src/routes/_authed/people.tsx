import { createFileRoute } from "@tanstack/react-router";

import { PeoplePage } from "@/features/people/people-page";
import { peopleQuery } from "@/features/people/queries";

export const Route = createFileRoute("/_authed/people")({
  loader: ({ context }) => context.queryClient.query(peopleQuery),
  head: () => ({ meta: [{ title: "People · Pakshi" }] }),
  component: function People() {
    return <PeoplePage viewer={Route.useRouteContext().viewer} />;
  },
});
