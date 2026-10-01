import { createFileRoute } from "@tanstack/react-router";

import { CatalogPage } from "@/features/blocks/catalog-page";
import { blockCatalogQuery } from "@/features/blocks/queries";

export const Route = createFileRoute("/_authed/blocks")({
  loader: ({ context }) => context.queryClient.query(blockCatalogQuery),
  component: function Blocks() {
    return <CatalogPage viewer={Route.useRouteContext().viewer} />;
  },
});
