import { useEffect, useLayoutEffect, useRef } from "react";

import { useEditorState, useStore } from "../context.tsx";

/** Where something the person can see sat in the frame before a change. */
interface Anchor {
  readonly element: Element;
  readonly top: number;
}

/**
 * What the person is looking at: the focused element when it's on screen,
 * otherwise the first field or block that starts in view, or failing that
 * the first one reaching into it.
 */
const anchorIn = (document: Document): Anchor | null => {
  const height = document.defaultView?.innerHeight ?? 0;
  const onScreen = (element: Element) => {
    const { top, bottom } = element.getBoundingClientRect();
    return bottom > 0 && top < height;
  };
  const focused = document.activeElement;
  if (focused !== null && focused !== document.body && onScreen(focused))
    return { element: focused, top: focused.getBoundingClientRect().top };
  const candidates = Array.from(
    document.querySelectorAll("[data-pakshi-block], [data-pakshi-field]"),
  );
  const element =
    candidates.find((candidate) => {
      const { top } = candidate.getBoundingClientRect();
      return top >= 0 && top < height;
    }) ?? candidates.find(onScreen);
  return element === undefined ? null : { element, top: element.getBoundingClientRect().top };
};

/**
 * Keeps what the person is looking at in place when someone else's change
 * adds, grows or removes content above it, by scrolling the frame by however
 * far it moved. It renders nothing, and reads only the draft's identity, so
 * it adds no work to the blocks.
 */
export function StableView(props: { readonly document: Document }) {
  const store = useStore();
  const view = useEditorState((state) => state.view);
  const anchor = useRef<Anchor | null>(null);

  useEffect(
    () =>
      store.beforeRemoteChange(() => {
        anchor.current = anchorIn(props.document);
      }),
    [store, props.document],
  );

  // After the change has rendered, and before it paints.
  useLayoutEffect(() => {
    const found = anchor.current;
    anchor.current = null;
    if (found === null || !found.element.isConnected) return;
    const moved = found.element.getBoundingClientRect().top - found.top;
    if (moved !== 0) props.document.defaultView?.scrollBy(0, moved);
  }, [view, props.document]);

  return null;
}
