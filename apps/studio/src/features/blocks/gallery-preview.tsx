import {
  type BlockDefinition,
  galleryBlocks,
  latestLockfile,
  loadBlocks,
  renderTree,
} from "@repo/blocks";
import { blockShowcase } from "@repo/blocks/fixtures";
import type { BlockType } from "@repo/contracts/ids";
import { ScaledSiteFrame } from "@repo/editor";
import { Skeleton } from "@repo/ui/components/skeleton";
import { cn } from "cn";
import { Suspense, use, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import siteCss from "@repo/blocks/site.css?url";

/** The newest version of every block, loaded once for every preview. */
const definitions = loadBlocks(latestLockfile);

/** Every preview's height for its width, so the cards line up. */
const heightPerWidth = 9 / 16;
/** The narrowest a block lays out at: a desktop's, where every grid shows all its columns. */
const narrowest = 1024;
/** Past this a section only widens its margins, so a taller block is cut off at the bottom instead. */
const widest = 1280;
/** How long each layout shows while someone points at the card. */
const cycleMs = 4000;
/** How far off screen a preview keeps its frame, so scrolling back doesn't rebuild it. */
const keptMargin = "150% 0px";

const layerCss = (height: number) => `
[data-pakshi-canvas] {
  display: grid; grid-template: minmax(0, 1fr) / minmax(0, 1fr); height: ${height}px; overflow: hidden;
}
.pakshi-layer {
  grid-area: 1 / 1; align-self: safe center; opacity: 0; transition: opacity 700ms ease;
}
.pakshi-layer[data-shown] { opacity: 1; }
.pakshi-layer[data-place="start"] { align-self: start; }
.pakshi-layer[data-place="end"] { align-self: end; }
.pakshi-ghost { opacity: 0.35; filter: grayscale(0.6); }
@media (prefers-reduced-motion: reduce) { .pakshi-layer { transition: none; } }
`;

const reducedMotion = "(prefers-reduced-motion: reduce)";

const subscribeToMotion = (onChange: () => void) => {
  const query = window.matchMedia(reducedMotion);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

/** Whether the person asked their system for less motion. */
const usePrefersReducedMotion = () =>
  useSyncExternalStore(
    subscribeToMotion,
    () => window.matchMedia(reducedMotion).matches,
    () => false,
  );

/** Whether an element is within `keptMargin` of the viewport. */
const useInRange = (element: Element | null) => {
  const [inRange, setInRange] = useState(false);
  useEffect(() => {
    if (element === null) return;
    const observer = new IntersectionObserver(
      (entries) => setInRange(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: keptMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return inRange;
};

/** An element's height as it lays out inside a preview's frame. */
const useFrameHeight = (element: HTMLElement | null) => {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const Observer = element?.ownerDocument.defaultView?.ResizeObserver;
    if (element === null || Observer === undefined) return;
    const observer = new Observer(() => setHeight(element.offsetHeight));
    observer.observe(element);
    return () => {
      observer.disconnect();
      setHeight(null);
    };
  }, [element]);
  return height;
};

/**
 * The block a page usually runs into from a header or footer, shown faded
 * beside it so it reads as the top or bottom of a page.
 */
const neighbourOf = (type: BlockType, placement: "header" | "footer") => {
  const index = galleryBlocks.findIndex((block) => block.type === type);
  const neighbour = galleryBlocks[placement === "header" ? index + 1 : index - 1];
  if (neighbour === undefined) throw new Error(`Nothing in the gallery sits beside ${type}.`);
  return neighbour.type;
};

/** The layout a block's sample starts with, then the newest version's others. */
const layoutsOf = (definition: BlockDefinition, first: string) => [
  first,
  ...definition.variants.filter((variant) => variant !== first),
];

interface PreviewProps {
  readonly type: BlockType;
  readonly name: string;
  /** Whether someone points at or focuses the preview's card. */
  readonly active: boolean;
}

/**
 * A block's sample as a site shows it, in the default theme, fitted to a
 * frame every card shares: it lays out at the narrowest desktop width that
 * shows all of it. While `active`, it fades through its layouts, one every
 * few seconds, unless the person asked for less motion.
 */
export function GalleryPreview(props: PreviewProps) {
  return (
    <Suspense
      fallback={<Skeleton className="rounded-none" style={{ aspectRatio: 1 / heightPerWidth }} />}
    >
      <FittedPreview {...props} />
    </Suspense>
  );
}

function FittedPreview(props: PreviewProps) {
  const loaded = use(definitions);
  const definition = loaded.get(props.type);
  if (definition === undefined) throw new Error(`No version of ${props.type} is loaded.`);
  const showcase = useMemo(() => blockShowcase(loaded, props.type), [loaded, props.type]);
  const layouts = useMemo(
    () => layoutsOf(definition, showcase.tree.variant),
    [definition, showcase.tree.variant],
  );
  const { placement } = definition;
  const neighbour = useMemo(
    () =>
      placement === "header" || placement === "footer"
        ? renderTree(loaded, blockShowcase(loaded, neighbourOf(props.type, placement)).tree)
        : null,
    [loaded, placement, props.type],
  );
  const blocks = useMemo(
    () => layouts.map((variant) => renderTree(loaded, { ...showcase.tree, variant })),
    [loaded, layouts, showcase.tree],
  );

  const reduceMotion = usePrefersReducedMotion();
  const cycling = props.active && !reduceMotion && layouts.length > 1;
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!cycling) return;
    const timer = setInterval(() => setStep((current) => current + 1), cycleMs);
    return () => {
      clearInterval(timer);
      setStep(0);
    };
  }, [cycling]);
  const shown = step % layouts.length;
  // Other layouts render once someone first points at the card, then stay ready.
  const [explored, setExplored] = useState(false);
  if (cycling && !explored) setExplored(true);

  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const inRange = useInRange(box);
  const [resting, setResting] = useState<HTMLDivElement | null>(null);
  const restingHeight = useFrameHeight(resting);
  const [width, setWidth] = useState(narrowest);
  const height = Math.round(width * heightPerWidth);
  // A section lays out wider until all of it fits; a header or footer sits at the top or bottom.
  const sitewide = placement === "header" || placement === "footer";
  const fitted =
    sitewide || restingHeight === null
      ? width
      : Math.min(widest, Math.max(width, Math.ceil(restingHeight / heightPerWidth)));
  if (fitted !== width) setWidth(fitted);
  const ready = restingHeight !== null && fitted === width;

  return (
    <div
      ref={setBox}
      className="relative overflow-hidden bg-muted"
      style={{ aspectRatio: 1 / heightPerWidth }}
    >
      {!ready && <Skeleton className="absolute inset-0 rounded-none" />}
      {inRange && (
        <div
          className={cn(
            "transition-opacity duration-500 motion-reduce:transition-none",
            ready ? "opacity-100" : "opacity-0",
          )}
        >
          <ScaledSiteFrame
            title={`${props.name}, as a page shows it`}
            siteCss={siteCss}
            theme={showcase.draft.brand.theme}
            scheme="light"
            data={showcase.data}
            width={width}
            maxHeight={height}
            extraCss={layerCss(height)}
          >
            {(explored ? layouts : layouts.slice(0, 1)).map((variant, index) => (
              <div
                key={variant}
                ref={index === 0 ? setResting : undefined}
                className="pakshi-layer"
                data-shown={index === shown || undefined}
                data-place={
                  placement === "header" ? "start" : placement === "footer" ? "end" : undefined
                }
              >
                {placement === "footer" && <div className="pakshi-ghost">{neighbour}</div>}
                {blocks[index]}
                {placement === "header" && <div className="pakshi-ghost">{neighbour}</div>}
              </div>
            ))}
          </ScaledSiteFrame>
        </div>
      )}
      {layouts.length > 1 && !reduceMotion && (
        <div
          aria-hidden
          className={cn(
            "absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-background/90 px-2 py-1.5 shadow-sm transition-opacity duration-200",
            cycling ? "opacity-100" : "opacity-0",
          )}
        >
          {layouts.map((variant, index) => (
            <span
              key={variant}
              className={cn(
                "h-1.5 rounded-full transition-[width,background-color] duration-500",
                index === shown ? "w-4 bg-foreground" : "w-1.5 bg-foreground/25",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
