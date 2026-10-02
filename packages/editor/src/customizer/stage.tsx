import { FieldEditingProvider } from "@repo/blocks";
import type { BlockId } from "@repo/contracts/ids";
import type { Target } from "@repo/contracts/ops";
import { useEffect, useMemo, useState } from "react";

import { CanvasChrome, useCanvasControls } from "../canvas/controls.tsx";
import { fieldEditing } from "../canvas/fields.tsx";
import { type CanvasColors, canvasCss, Frame } from "../canvas/frame.tsx";
import { GhostPolicyProvider, showcasePolicy } from "../canvas/ghost.tsx";
import { BlockView, SitePart } from "../canvas/page-view.tsx";
import { useEditorState, useServices } from "../context.tsx";
import { useStillPage } from "../editor.tsx";
import { SiteContentMarks } from "./site-content-marks.tsx";

/** How the block is shown: on a computer's screen, scaled to fit, or at a phone's real size. */
export type Screen = "computer" | "phone";

/** The page widths each screen lays the block out at. */
const screenWidths: Readonly<Record<Screen, number>> = { computer: 1024, phone: 375 };

/** The block alone on the page shows no outline of its own, since it's the only thing there. */
const showcaseCss = `
[data-pakshi-canvas] > [data-pakshi-block]:is(:hover, :focus, [data-pakshi-selected]) { outline: none; }
html, body { overflow: hidden; }
`;

/**
 * The block in a plain browser window, edited in place. On a computer's
 * screen the page lays out at a computer's width and is scaled to fit; on a
 * phone it's shown at its real size. The window is as tall as the block.
 */
export function Stage(props: {
  readonly target: Target;
  readonly block: BlockId;
  readonly screen: Screen;
  readonly colors: CanvasColors;
}) {
  const { siteCss, scheme } = useServices();
  const controls = useCanvasControls();
  const theme = useEditorState((state) => state.view.brand.theme);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [room, setRoom] = useState(0);
  const [height, setHeight] = useState(0);
  const canvasDocument = controls.document;
  const policy = useMemo(() => showcasePolicy(props.block), [props.block]);
  useStillPage(canvasDocument);

  useEffect(() => {
    if (box === null) return;
    const observer = new ResizeObserver(() => setRoom(box.clientWidth));
    observer.observe(box);
    return () => observer.disconnect();
  }, [box]);

  useEffect(() => {
    const content = canvasDocument?.querySelector("[data-pakshi-canvas]");
    const Observer = canvasDocument?.defaultView?.ResizeObserver;
    if (content === null || content === undefined || Observer === undefined) return;
    const observer = new Observer(() => setHeight(content.scrollHeight));
    observer.observe(content);
    return () => observer.disconnect();
  }, [canvasDocument]);

  const width = screenWidths[props.screen];
  const scale = room === 0 ? 1 : Math.min(1, room / width);
  return (
    <div
      ref={setBox}
      className="relative flex min-h-80 w-full items-center justify-center"
      data-pakshi-canvas-area
    >
      <div
        className="overflow-hidden rounded-lg bg-card shadow-lg ring-1 ring-foreground/10"
        style={{ width: width * scale }}
      >
        <div aria-hidden className="flex h-7 items-center gap-1.5 border-b bg-muted px-3">
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
        </div>
        <div className="relative" style={{ height: height * scale }}>
          <Frame
            title="The block, which you can change right here"
            siteCss={siteCss}
            theme={theme}
            scheme={scheme}
            extraCss={`${canvasCss(props.colors, scale)}${showcaseCss}`}
            className="absolute top-0 left-0 origin-top-left border-0 bg-background"
            style={{ width, height, transform: `scale(${scale})` }}
            onDocument={controls.setCanvasDocument}
          >
            <FieldEditingProvider value={fieldEditing}>
              <GhostPolicyProvider value={policy}>
                <SitePart target={props.target}>
                  <BlockView target={props.target} id={props.block} />
                </SitePart>
              </GhostPolicyProvider>
            </FieldEditingProvider>
          </Frame>
        </div>
      </div>
      {box !== null && canvasDocument !== null && (
        <>
          <CanvasChrome container={box} document={canvasDocument} clip={false} />
          <SiteContentMarks container={box} document={canvasDocument} block={props.block} />
        </>
      )}
    </div>
  );
}
