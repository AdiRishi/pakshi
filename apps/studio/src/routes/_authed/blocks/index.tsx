import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";

import { BlocksSearch } from "@/features/blocks/gallery";
import { GalleryPage } from "@/features/blocks/gallery-page";
import { blockRequestsQuery } from "@/features/blocks/queries";

export const Route = createFileRoute("/_authed/blocks/")({
  validateSearch: Schema.toStandardSchemaV1(BlocksSearch),
  loader: ({ context }) => context.queryClient.query(blockRequestsQuery),
  component: function Blocks() {
    return (
      <GalleryPage viewer={Route.useRouteContext().viewer} tab={Route.useSearch().tab ?? "all"} />
    );
  },
});
