import { createFileRoute } from "@tanstack/react-router";

import { rolesQuery } from "@/features/roles/queries";
import { RolesPage } from "@/features/roles/roles-page";

export const Route = createFileRoute("/_authed/roles")({
  loader: ({ context }) => context.queryClient.query(rolesQuery),
  head: () => ({ meta: [{ title: "Roles · Pakshi" }] }),
  component: function Roles() {
    return <RolesPage viewer={Route.useRouteContext().viewer} />;
  },
});
