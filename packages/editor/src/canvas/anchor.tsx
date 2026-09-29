import { useEffect, useState } from "react";

export interface Rect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where an element inside the canvas frame sits, relative to `container`
 * outside it, kept current as the page scrolls or resizes. Studio's popovers
 * and toolbars are positioned from it, so they use Studio's styles.
 */
export const useCanvasRect = (element: HTMLElement | null, container: HTMLElement | null) => {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    const frame = element?.ownerDocument.defaultView;
    const frameElement = frame?.frameElement;
    if (
      element === null ||
      container === null ||
      frame === null ||
      frame === undefined ||
      frameElement === null ||
      frameElement === undefined
    )
      return;
    const measure = () => {
      const inner = element.getBoundingClientRect();
      const outer = frameElement.getBoundingClientRect();
      const box = container.getBoundingClientRect();
      setRect({
        top: outer.top - box.top + inner.top,
        left: outer.left - box.left + inner.left,
        width: inner.width,
        height: inner.height,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
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
