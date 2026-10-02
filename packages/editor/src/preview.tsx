import { type BlockDefinition, renderTree, type SiteData, SiteDataProvider } from "@repo/blocks";
import type { BlockType } from "@repo/contracts/ids";
import type { BlockTree } from "@repo/contracts/ops";
import type { ColorScheme, ResolvedTheme } from "@repo/tokens";
import { cn } from "cn";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { Frame } from "./canvas/frame.tsx";
import { useDraftSiteData } from "./canvas/page-view.tsx";
import { useEditorState, useServices } from "./context.tsx";

/** The width a preview lays a page out at, a desktop's, before scaling it to fit. */
const desktopWidth = 1280;
/** How far outside the viewport a preview starts rendering, so it's ready as it scrolls in. */
const nearViewport = "400px";
/** How tall a preview stands, in the page's own pixels, until it has measured what it shows. */
const unmeasuredHeight = 720;

interface PreviewProps {
  /** Names the frame for assistive technology, though nothing in it takes focus. */
  readonly title: string;
  /** The address of the stylesheet `sites` renders pages with. */
  readonly siteCss: string;
  readonly theme: ResolvedTheme;
  readonly scheme: ColorScheme;
  /** What blocks read beyond their props: the site's name, menus, posts, forms and images. */
  readonly data: SiteData;
  /** The width the page lays out at before it's scaled to the container's width. */
  readonly width?: number;
  /** The most of the page's height to show, in its own pixels. Below that it's cut off. */
  readonly maxHeight?: number;
  readonly className?: string;
}

/**
 * Part of a site as `sites` renders it, laid out at `width` and scaled down to
 * its container's width, as tall as what it shows. It only shows: nothing in
 * it takes focus or the pointer. It renders once it comes near the viewport,
 * so a page of previews only renders the ones someone scrolls to.
 */
export function ScaledSiteFrame(
  props: PreviewProps & {
    /** CSS for the frame beyond the site's own, such as labels drawn over blocks. */
    readonly extraCss?: string;
    readonly children: ReactNode;
  },
) {
  const width = props.width ?? desktopWidth;
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const [near, setNear] = useState(false);
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);
  const [height, setHeight] = useState(unmeasuredHeight);

  useEffect(() => {
    if (box === null) return;
    const observer = new ResizeObserver(() => setBoxWidth(box.clientWidth));
    observer.observe(box);
    return () => observer.disconnect();
  }, [box]);

  useEffect(() => {
    if (box === null || near) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: nearViewport },
    );
    observer.observe(box);
    return () => observer.disconnect();
  }, [box, near]);

  useEffect(() => {
    const content = frameDocument?.querySelector("[data-pakshi-canvas]");
    const Observer = frameDocument?.defaultView?.ResizeObserver;
    if (content === null || content === undefined || Observer === undefined) return;
    const observer = new Observer(() => setHeight(content.scrollHeight));
    observer.observe(content);
    return () => observer.disconnect();
  }, [frameDocument]);

  const shown = Math.min(height, props.maxHeight ?? height);
  const scale = boxWidth / width;
  return (
    <div
      ref={setBox}
      className={cn("relative w-full overflow-hidden", props.className)}
      style={{ height: shown * scale }}
    >
      {near && (
        <Frame
          title={props.title}
          siteCss={props.siteCss}
          theme={props.theme}
          scheme={props.scheme}
          extraCss={props.extraCss}
          inert
          className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
          style={{ width, height: shown, transform: `scale(${scale})` }}
          onDocument={setFrameDocument}
        >
          <SiteDataProvider value={props.data}>{props.children}</SiteDataProvider>
        </Frame>
      )}
    </div>
  );
}

/**
 * One block, with the items in its slots, as `sites` renders it, scaled to
 * fit. A new layout or background is the same tree with another variant or
 * surface, and shows without reloading the frame.
 */
export function ScaledBlockPreview(
  props: PreviewProps & {
    /** The block versions to render with, by type. */
    readonly definitions: ReadonlyMap<BlockType, BlockDefinition>;
    readonly tree: BlockTree;
  },
) {
  const { definitions, tree, ...frame } = props;
  const element = useMemo(() => renderTree(definitions, tree), [definitions, tree]);
  return <ScaledSiteFrame {...frame}>{element}</ScaledSiteFrame>;
}

/** The tallest part of a block the editor's previews show, in the block's own pixels. */
const editorMaxHeight = 960;

/** A block as the draft's theme and content show it, scaled to fit, for the editor's choosers. */
export function BlockPreview(props: { readonly tree: BlockTree; readonly title: string }) {
  const { definitions, siteCss, scheme } = useServices();
  const theme = useEditorState((state) => state.view.brand.theme);
  const data = useDraftSiteData();
  return (
    <ScaledBlockPreview
      title={props.title}
      siteCss={siteCss}
      theme={theme}
      scheme={scheme}
      data={data}
      definitions={definitions}
      tree={props.tree}
      maxHeight={editorMaxHeight}
      className="min-h-12 rounded-md border bg-background"
    />
  );
}
