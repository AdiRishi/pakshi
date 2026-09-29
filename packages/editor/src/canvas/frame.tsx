import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/*
 * Marks the editor draws inside the canvas. They're outlines and pseudo
 * content only, so they never change the page's layout, and they scroll with
 * the page because they belong to it.
 */
const editorCss = `
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
`;

const shell = (siteCss: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
  `<link rel="stylesheet" href="${siteCss}"><style data-pakshi-theme></style>` +
  `<style data-pakshi-editor></style></head><body><div data-pakshi-canvas></div></body></html>`;

/**
 * A same-origin frame that Studio's React tree renders the page into through
 * a portal. It loads only the site stylesheet and the draft's theme, never
 * Studio's styles, and its width is the page's own, so its media queries apply.
 */
export function CanvasFrame(props: {
  readonly title: string;
  readonly siteCss: string;
  readonly themeCss: string;
  /** The editor's own accent color, read from Studio's theme. */
  readonly accent: string;
  readonly width: number | null;
  readonly onDocument?: (document: Document) => void;
  readonly children: ReactNode;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [srcDoc] = useState(() => shell(props.siteCss));
  const { onDocument } = props;

  const attach = () => {
    const document = frame.current?.contentDocument;
    const container = document?.querySelector<HTMLElement>("[data-pakshi-canvas]");
    if (
      document === undefined ||
      document === null ||
      container === null ||
      container === undefined
    )
      return;
    setRoot(container);
    onDocument?.(document);
  };

  // A frame that finished loading before React attached its load handler never fires it again.
  useEffect(() => {
    if (root === null && frame.current?.contentDocument?.readyState === "complete") attach();
  });

  useEffect(() => {
    const document = root?.ownerDocument;
    const theme = document?.querySelector("style[data-pakshi-theme]");
    if (theme !== null && theme !== undefined) theme.textContent = props.themeCss;
  }, [root, props.themeCss]);

  useEffect(() => {
    const document = root?.ownerDocument;
    const editor = document?.querySelector("style[data-pakshi-editor]");
    if (editor !== null && editor !== undefined)
      editor.textContent = `:root { --pakshi-editor-accent: ${props.accent}; }${editorCss}`;
  }, [root, props.accent]);

  return (
    <>
      <iframe
        ref={frame}
        title={props.title}
        srcDoc={srcDoc}
        onLoad={attach}
        className="mx-auto block h-full border-0 bg-background shadow-sm transition-[width]"
        style={{ width: props.width === null ? "100%" : props.width }}
      />
      {root !== null && createPortal(props.children, root)}
    </>
  );
}
