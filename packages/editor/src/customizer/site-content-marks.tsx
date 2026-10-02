import type { BlockId } from "@repo/contracts/ids";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle } from "@repo/ui/components/popover";
import { LockIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";

import { type Rect, rectIn, screenRect } from "../canvas/anchor.tsx";
import { DoneButton } from "../canvas/done.tsx";
import { useDraftSiteData } from "../canvas/page-view.tsx";
import { blockElement } from "../canvas/regions.ts";
import { siteContentIn } from "../canvas/site-content.ts";
import { useEditorState } from "../context.tsx";
import { useShowcase } from "./showcase.tsx";

const sameElements = (a: ReadonlyArray<Element>, b: ReadonlyArray<Element>) =>
  a.length === b.length && a.every((element, index) => element === b[index]);

/**
 * What the block shows from the site: striped while it's pointed at, with a
 * label that says so, and when clicked, a popover that says where it's
 * changed. It can't be changed here.
 */
export function SiteContentMarks(props: {
  readonly container: HTMLElement;
  readonly document: Document;
  readonly block: BlockId;
}) {
  const showcase = useShowcase();
  const { siteContent, setSiteContent, explaining, explain } = showcase;
  const data = useDraftSiteData();
  const view = useEditorState((state) => state.view);
  const [pointed, setPointed] = useState(false);
  const [rects, setRects] = useState<ReadonlyArray<Rect>>([]);
  const [moved, setMoved] = useState(0);

  // Found again whenever the page changes, since a layout or a part can move it.
  useLayoutEffect(() => {
    const root = blockElement(props.document, props.block);
    const found = root === null ? null : siteContentIn(root, data);
    if (
      found?.label !== siteContent?.label ||
      !sameElements(found?.elements ?? [], siteContent?.elements ?? [])
    )
      setSiteContent(found);
    // oxlint-disable-next-line react/set-state-in-effect -- measuring layout before the browser paints, then drawing from it, is what layout effects are for
    setRects(
      (found?.elements ?? []).flatMap((element) => {
        const rect = rectIn(element, props.container);
        return rect === null ? [] : [rect];
      }),
    );
  }, [
    props.document,
    props.block,
    props.container,
    data,
    view,
    moved,
    siteContent,
    setSiteContent,
  ]);

  useEffect(() => {
    const frame = props.document.defaultView;
    const Observer = frame?.ResizeObserver;
    if (frame === null || Observer === undefined) return;
    const observer = new Observer(() => setMoved((count) => count + 1));
    observer.observe(props.document.body);
    return () => observer.disconnect();
  }, [props.document]);

  // Pointing at it shows the stripes; clicking it says where it's changed.
  const elements = siteContent?.elements;
  useEffect(() => {
    const frame = props.document.defaultView;
    if (frame === null || elements === undefined) return;
    const within = (target: EventTarget | null) =>
      target instanceof frame.Element
        ? (elements.find((element) => element.contains(target)) ?? null)
        : null;
    const onMove = (event: PointerEvent) => setPointed(within(event.target) !== null);
    const onLeave = () => setPointed(false);
    const onClick = (event: MouseEvent) => {
      const element = within(event.target);
      if (element !== null) explain(element);
    };
    props.document.addEventListener("pointermove", onMove);
    props.document.documentElement.addEventListener("pointerleave", onLeave);
    props.document.addEventListener("click", onClick);
    return () => {
      props.document.removeEventListener("pointermove", onMove);
      props.document.documentElement.removeEventListener("pointerleave", onLeave);
      props.document.removeEventListener("click", onClick);
    };
  }, [props.document, elements, explain]);

  const [first] = rects;
  if (siteContent === null || first === undefined) return null;
  const shown = pointed || explaining !== null;
  return (
    <>
      {shown && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
          {rects.map((rect) => (
            <div
              key={`${rect.top}:${rect.left}`}
              className="absolute rounded-sm bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--ring)_14%,transparent)_0_calc(var(--spacing)*1),transparent_0_calc(var(--spacing)*2.5))] outline-2 outline-offset-2 outline-ring/50"
              style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
            />
          ))}
          <span
            className="absolute flex -translate-y-full items-center gap-1.5 rounded-full bg-foreground px-3 py-1 text-xs font-medium whitespace-nowrap text-background shadow-md"
            style={{ top: first.top - 8, left: first.left }}
          >
            <LockIcon className="size-3" />
            From your site
          </span>
        </div>
      )}
      {explaining !== null && (
        <Popover
          open
          onOpenChange={(open) => {
            if (!open) explain(null);
          }}
        >
          <PopoverContent
            anchor={{ getBoundingClientRect: () => screenRect(explaining) ?? new DOMRect() }}
            side="bottom"
            align="start"
            sideOffset={8}
            className="w-80"
          >
            <PopoverHeader>
              <PopoverTitle className="font-semibold">{siteContent.label}</PopoverTitle>
            </PopoverHeader>
            <p className="text-muted-foreground">{siteContent.explanation}</p>
            <div className="flex justify-end">
              <DoneButton onClick={() => explain(null)} />
            </div>
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}
