import { cx } from "class-variance-authority";
import type { ReactNode } from "react";

/**
 * A row that scrolls by itself. `items` are the editable originals, and
 * `copies` the same items drawn again for the loop, hidden from screen
 * readers and from editing. It takes focus, which pauses it, and stands still
 * as a sideways scroller with the theme's motion off or for visitors who ask
 * for less motion.
 */
export const Marquee = (props: {
  readonly items: ReactNode;
  readonly copies: ReactNode;
  readonly className?: string;
}) => (
  <div
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a row that scrolls sideways needs focus for the keyboard to scroll it, as its items may hold no links
    tabIndex={0}
    className="marquee focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
  >
    <div className="marquee-track">
      <div className={cx("flex shrink-0 items-center", props.className)}>{props.items}</div>
      <div aria-hidden className={cx("marquee-copy shrink-0 items-center", props.className)}>
        {props.copies}
      </div>
    </div>
  </div>
);
