import { createFileRoute } from "@tanstack/react-router";

import { BrandsPage } from "@/features/brands/brands-page";
import { brandsQuery } from "@/features/brands/queries";

export const Route = createFileRoute("/_authed/brands/")({
  loader: ({ context }) => context.queryClient.query(brandsQuery),
  component: function Brands() {
    return <BrandsPage viewer={Route.useRouteContext().viewer} />;
  },
});
