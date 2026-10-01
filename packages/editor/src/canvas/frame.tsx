import { type ColorScheme, type ResolvedTheme, themeFontFaces, themeVariables } from "@repo/tokens";
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { presenceColorCount } from "../presence.ts";

/*
 * Marks the editor draws inside the canvas. They're outlines and pseudo
 * content only, so they never change the page's layout, and they scroll with
 * the page because they belong to it. The browser's own scroll anchoring is
 * off, because the editor keeps the view in place itself, in every browser.
 * Sections show at once rather than fading in as the theme's motion has them
 * do on the site.
 */
const editorCss = `
html { overflow-anchor: none; }
main > [data-surface] { animation: none; }
[data-pakshi-block] { cursor: default; }
[data-pakshi-block]:hover:not(:has([data-pakshi-block]:hover)) {
  outline: 2px dashed var(--pakshi-editor-accent); outline-offset: -2px;
}
[data-pakshi-block][data-pakshi-selected] {
  outline: 2px solid var(--pakshi-editor-accent); outline-offset: -2px;
}
[data-pakshi-block]:focus { outline: 2px solid var(--pakshi-editor-accent); outline-offset: -2px; }
[data-pakshi-field] { cursor: text; }
[data-pakshi-field]:focus-visible, [data-pakshi-field][data-pakshi-selected] {
  outline: 2px solid var(--pakshi-editor-accent); outline-offset: 4px; border-radius: 2px;
}
img[data-pakshi-field], a[data-pakshi-field] { cursor: pointer; }
[data-pakshi-empty]::before {
  content: attr(data-pakshi-placeholder); opacity: 0.5; pointer-events: none;
}
.pakshi-overlay {
  position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483000;
  pointer-events: none; font: 600 12px/1 system-ui, sans-serif;
}
.pakshi-overlay > * { position: static; }
.pakshi-handle, .pakshi-insert, .pakshi-badge, .pakshi-drop-line { position: absolute; }
.pakshi-handle, .pakshi-insert {
  display: flex; align-items: center; gap: 4px; pointer-events: auto; border: 0;
  color: #fff; background: var(--pakshi-editor-accent); font: inherit;
}
.pakshi-handle {
  height: 24px; padding: 0 8px 0 4px; border-radius: 6px; cursor: grab; white-space: nowrap;
}
.pakshi-insert {
  height: 28px; padding: 0 12px 0 8px; border-radius: 14px; border: 2px solid #fff;
  transform: translate(-50%, -50%); cursor: pointer; white-space: nowrap;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.2);
}
.pakshi-insert-round { width: 28px; padding: 0; justify-content: center; }
.pakshi-badge {
  transform: translateX(-100%); padding: 4px 8px; border-radius: 8px;
  background: #ffe2a8; color: #6b4000; pointer-events: none;
}
.pakshi-drop-line { background: var(--pakshi-editor-accent); border-radius: 2px; }
.pakshi-highlight {
  position: absolute; box-sizing: border-box; border: 2px solid var(--pakshi-editor-accent);
  border-radius: 4px; pointer-events: none;
  background: color-mix(in oklab, var(--pakshi-editor-accent) 12%, transparent);
  animation: pakshi-highlight 2.5s ease-out forwards;
}
@keyframes pakshi-highlight { 0%, 60% { opacity: 1; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .pakshi-highlight { animation: none; } }
.pakshi-presence {
  position: absolute; box-sizing: border-box; border: 2px solid var(--pakshi-presence);
  border-radius: 4px; pointer-events: none;
}
.pakshi-presence-label {
  position: absolute; bottom: 100%; right: -2px; padding: 3px 8px; white-space: nowrap;
  border-radius: 6px 6px 0 0; background: var(--pakshi-presence); color: #fff; font-size: 11px;
}
${Array.from(
  { length: presenceColorCount },
  (_, index) =>
    `.pakshi-presence[data-color="${index + 1}"] { --pakshi-presence: var(--pakshi-presence-${index + 1}); }`,
).join("\n")}
`;

const shell = (siteCss: string, fonts: string, variables: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
  `<link rel="stylesheet" href="${siteCss}"><style data-pakshi-fonts>${fonts}</style>` +
  `<style data-pakshi-theme>${variables}</style>` +
  `<style data-pakshi-editor></style></head><body><div data-pakshi-canvas></div></body></html>`;

/** Replaces the text of one of the frame's style elements. */
const setStyle = (document: Document | undefined, name: string, css: string) => {
  const style = document?.querySelector(`style[data-pakshi-${name}]`);
  if (style !== null && style !== undefined) style.textContent = css;
};

/**
 * A same-origin frame that Studio's React tree renders into through a portal.
 * It loads only the site stylesheet, a theme in one color scheme and
 * `extraCss`, never Studio's styles, and its width is the page's own, so its
 * media queries apply.
 *
 * The theme's font faces sit in a style of their own, so switching schemes
 * keeps the loaded fonts.
 */
export function Frame(props: {
  readonly title: string;
  readonly siteCss: string;
  readonly theme: ResolvedTheme;
  readonly scheme: ColorScheme;
  readonly extraCss?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
  /** A frame that only shows something: it takes no focus and hides from assistive technology. */
  readonly inert?: boolean;
  readonly onDocument?: ((document: Document) => void) | undefined;
  readonly children: ReactNode;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const fonts = useMemo(() => themeFontFaces(props.theme), [props.theme]);
  const variables = useMemo(
    () => themeVariables(props.theme, props.scheme),
    [props.theme, props.scheme],
  );
  const [srcDoc] = useState(() => shell(props.siteCss, fonts, variables));
  const { onDocument } = props;

  const attaching = useRef(false);

  const attach = () => {
    const document = frame.current?.contentDocument;
    const container = document?.querySelector<HTMLElement>("[data-pakshi-canvas]");
    if (
      document === undefined ||
      document === null ||
      container === null ||
      container === undefined ||
      attaching.current
    )
      return;
    attaching.current = true;
    // The page renders once the theme's fonts have loaded, as it lays out on
    // the site: a form's select keeps where it placed its text with the
    // fallback font even after the theme's font arrives.
    Promise.allSettled(Array.from(document.fonts, (face) => face.load()))
      .then(() => {
        setRoot(container);
        onDocument?.(document);
      })
      .catch(reportError);
  };

  // A frame that finished loading before React attached its load handler never fires it again.
  useEffect(() => {
    if (root === null && frame.current?.contentDocument?.readyState === "complete") attach();
  });

  useEffect(() => setStyle(root?.ownerDocument, "fonts", fonts), [root, fonts]);
  useEffect(() => setStyle(root?.ownerDocument, "theme", variables), [root, variables]);
  useEffect(
    () => setStyle(root?.ownerDocument, "editor", props.extraCss ?? ""),
    [root, props.extraCss],
  );

  return (
    <>
      <iframe
        ref={frame}
        title={props.title}
        srcDoc={srcDoc}
        onLoad={attach}
        className={props.className}
        style={props.style}
        tabIndex={props.inert === true ? -1 : undefined}
        aria-hidden={props.inert === true || undefined}
        inert={props.inert === true || undefined}
      />
      {root !== null && createPortal(props.children, root)}
    </>
  );
}

/** The canvas's frame: the page at a chosen width, with the editor's outlines drawn in its accent. */
export function CanvasFrame(props: {
  readonly title: string;
  readonly siteCss: string;
  readonly theme: ResolvedTheme;
  readonly scheme: ColorScheme;
  /** The editor's own accent color, read from Studio's theme. */
  readonly accent: string;
  /** The colors that tell other people apart, from Studio's theme, in order. */
  readonly presence: ReadonlyArray<string>;
  readonly width: number | null;
  readonly onDocument?: (document: Document) => void;
  readonly children: ReactNode;
}) {
  return (
    <Frame
      title={props.title}
      siteCss={props.siteCss}
      theme={props.theme}
      scheme={props.scheme}
      extraCss={`:root { --pakshi-editor-accent: ${props.accent}; ${props.presence
        .map((color, index) => `--pakshi-presence-${index + 1}: ${color};`)
        .join(" ")} }${editorCss}`}
      className="mx-auto block h-full border-0 bg-background shadow-sm transition-[width]"
      style={{ width: props.width === null ? "100%" : props.width }}
      onDocument={props.onDocument}
    >
      {props.children}
    </Frame>
  );
}
