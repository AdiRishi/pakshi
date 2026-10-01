import { renderBlock, SiteDataProvider } from "@repo/blocks";
import type { BlockId } from "@repo/contracts/ids";
import type { BlockTree } from "@repo/contracts/ops";
import type { BlockInstance } from "@repo/contracts/page";
import { useEffect, useMemo, useState } from "react";

import { Frame } from "./canvas/frame.tsx";
import { useDraftSiteData } from "./canvas/page-view.tsx";
import { useEditorState, useServices } from "./context.tsx";

/** The width a preview lays a block out at before scaling it down. */
const pageWidth = 1280;
/** The tallest part of a block a preview shows, in the block's own pixels. */
const maxHeight = 960;

/** A block tree as the flat instances `renderBlock` reads. */
const flatten = (tree: BlockTree): Readonly<Record<BlockId, BlockInstance>> => {
  const { id, slots, ...block } = tree;
  const items = Object.values(slots ?? {}).flat();
  return Object.fromEntries([
    [
      id,
      slots === undefined
        ? block
        : {
            ...block,
            slots: Object.fromEntries(
              Object.entries(slots).map(([slot, list]) => [slot, list.map((item) => item.id)]),
            ),
          },
    ],
    ...items.map(({ id: itemId, ...item }) => [itemId, item]),
  ]);
};

/**
 * A block rendered as `sites` renders it, in the draft's theme, scaled down to
 * its container's width. It only shows: nothing in it takes focus.
 */
export function BlockPreview(props: { readonly tree: BlockTree; readonly title: string }) {
  const { definitions, siteCss, scheme } = useServices();
  const theme = useEditorState((state) => state.view.brand.theme);
  const data = useDraftSiteData();
  const element = useMemo(
    () => renderBlock(definitions, flatten(props.tree), props.tree.id),
    [definitions, props.tree],
  );
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (box === null) return;
    const observer = new ResizeObserver(() => setWidth(box.clientWidth));
    observer.observe(box);
    return () => observer.disconnect();
  }, [box]);

  useEffect(() => {
    const content = frameDocument?.querySelector("[data-pakshi-canvas]");
    const Observer = frameDocument?.defaultView?.ResizeObserver;
    if (content === null || content === undefined || Observer === undefined) return;
    const observer = new Observer(() => setHeight(Math.min(content.scrollHeight, maxHeight)));
    observer.observe(content);
    return () => observer.disconnect();
  }, [frameDocument]);

  const scale = width / pageWidth;
  return (
    <div
      ref={setBox}
      className="relative w-full overflow-hidden rounded-md border bg-background"
      style={{ height: Math.max(height * scale, 48) }}
    >
      <Frame
        title={props.title}
        siteCss={siteCss}
        theme={theme}
        scheme={scheme}
        inert
        className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
        style={{ width: pageWidth, height: maxHeight, transform: `scale(${scale})` }}
        onDocument={setFrameDocument}
      >
        <SiteDataProvider value={data}>{element}</SiteDataProvider>
      </Frame>
    </div>
  );
}
