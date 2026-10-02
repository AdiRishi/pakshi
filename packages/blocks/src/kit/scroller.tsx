import { cx } from "class-variance-authority";
import type { ReactNode } from "react";

/**
 * A row of cards that scrolls sideways, snapping to each card, with the next
 * one peeking in from the edge so it reads as more to see. The row runs to
 * the page's edge while its first card lines up with the content above.
 */
export const scrollerClass = cx(
  "scroller-row flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4",
  "[scrollbar-width:thin] md:gap-6",
);

/** How wide each card in a scroller is, by how many show at once on a large screen. */
export const scrollerItem = {
  "1": "w-5/6 shrink-0 snap-start md:w-2/3",
  "2": "w-5/6 shrink-0 snap-start sm:w-3/5 md:w-5/11",
  "3": "w-4/5 shrink-0 snap-start sm:w-5/11 lg:w-3/10",
  "4": "w-2/3 shrink-0 snap-start sm:w-2/5 lg:w-2/9",
} as const;

export const Scroller = (props: {
  readonly as?: "ul" | "div";
  readonly className?: string;
  readonly children: ReactNode;
}) => {
  const Element = props.as ?? "div";
  return <Element className={cx(scrollerClass, props.className)}>{props.children}</Element>;
};
