import { useEffect, useState } from "react";

export interface Rect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where an element inside the canvas frame is drawn on Studio's screen. The
 * frame may be scaled down to fit, as the block customizer's is, so the
 * element's place in the frame is scaled the same way.
 */
export const screenRect = (element: Element): DOMRect | null => {
  const frame = element.ownerDocument.defaultView?.frameElement;
  if (!(frame instanceof HTMLElement)) return null;
  const inner = element.getBoundingClientRect();
  const outer = frame.getBoundingClientRect();
  const scale = frame.offsetWidth === 0 ? 1 : outer.width / frame.offsetWidth;
  return new DOMRect(
    outer.left + inner.left * scale,
    outer.top + inner.top * scale,
    inner.width * scale,
    inner.height * scale,
  );
};

/** Where an element inside the canvas frame is drawn, relative to `container` outside it. */
export const rectIn = (element: Element, container: Element): Rect | null => {
  const drawn = screenRect(element);
  if (drawn === null) return null;
  const box = container.getBoundingClientRect();
  return {
    top: drawn.top - box.top,
    left: drawn.left - box.left,
    width: drawn.width,
    height: drawn.height,
  };
};

/**
 * Where an element inside the canvas frame sits, relative to `container`
 * outside it, kept current as the page scrolls or resizes. Studio's popovers
 * and toolbars are positioned from it, so they use Studio's styles.
 */
export const useCanvasRect = (element: Element | null, container: Element | null) => {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    const frame = element?.ownerDocument.defaultView;
    if (element === null || container === null || frame === null || frame === undefined) return;
    const measure = () => setRect(rectIn(element, container));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(container);
    frame.addEventListener("scroll", measure, { passive: true });
    frame.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      frame.removeEventListener("scroll", measure);
      frame.removeEventListener("resize", measure);
    };
  }, [element, container]);
  return rect;
};
