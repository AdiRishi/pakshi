import { createFileRoute } from "@tanstack/react-router";

import { BlockPage } from "@/features/blocks/block-page";
import { blockTypeParams } from "@/features/blocks/block-route";

export const Route = createFileRoute("/_authed/blocks/$blockType")({
  params: blockTypeParams,
  component: function Block() {
    return <BlockPage viewer={Route.useRouteContext().viewer} type={Route.useParams().blockType} />;
  },
});
