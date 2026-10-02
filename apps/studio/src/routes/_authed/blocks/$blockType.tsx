import { createFileRoute } from "@tanstack/react-router";

import { BlockPage, newestBlocksQuery } from "@/features/blocks/block-page";
import { blockTypeParams } from "@/features/blocks/block-route";
import { blockRequestsQuery, blockUsageQuery } from "@/features/blocks/queries";

export const Route = createFileRoute("/_authed/blocks/$blockType")({
  params: blockTypeParams,
  // The block is edited in place in a frame, which renders on the client only.
  ssr: false,
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.query(newestBlocksQuery),
      context.queryClient.query(blockUsageQuery(params.blockType)),
      context.queryClient.query(blockRequestsQuery),
    ]),
  component: function Block() {
    return <BlockPage viewer={Route.useRouteContext().viewer} type={Route.useParams().blockType} />;
  },
});
