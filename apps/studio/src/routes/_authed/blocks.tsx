import { createFileRoute } from "@tanstack/react-router";

import { CatalogPage } from "@/features/blocks/catalog-page";
import { blockCatalogQuery, blockRequestsQuery } from "@/features/blocks/queries";

export const Route = createFileRoute("/_authed/blocks")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query(blockCatalogQuery),
      context.queryClient.query(blockRequestsQuery),
    ]),
  component: function Blocks() {
    return <CatalogPage viewer={Route.useRouteContext().viewer} />;
  },
});
