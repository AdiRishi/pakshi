import type { Viewer } from "@repo/contracts/studio";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { BlockRequestList, RequestBlockDialog } from "./block-requests";
import { BlockUpdates } from "./block-updates";
import { BlockGallery, type GalleryTab } from "./gallery";
import { blockRequestsQuery } from "./queries";

/** The blocks page with the person's requests, the request form and, for the platform team, updates. */
export function GalleryPage(props: { readonly viewer: Viewer; readonly tab: GalleryTab }) {
  const { data: requests } = useSuspenseQuery(blockRequestsQuery);
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  const open = (tab: GalleryTab) =>
    navigate({ to: "/blocks", search: tab === "all" ? {} : { tab }, replace: true });
  const onAsk = requests.sites.length > 0 ? () => setAsking(true) : null;
  return (
    <>
      <BlockGallery
        viewer={props.viewer}
        tab={props.tab}
        onTab={(tab) => void open(tab)}
        onAsk={onAsk}
        asked={<BlockRequestList data={requests} onAsk={onAsk} />}
        updates={props.viewer.can.upgradeBlocks ? <BlockUpdates /> : null}
      />
      <RequestBlockDialog
        open={asking}
        onOpenChange={setAsking}
        sites={requests.sites}
        onSent={() => void open("asked")}
      />
    </>
  );
}
