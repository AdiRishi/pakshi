import { cx } from "class-variance-authority";
import type { ReactNode } from "react";

/**
 * A row that scrolls by itself. `items` are the editable originals, and
 * `copies` the same items drawn again for the loop, hidden from screen
 * readers and from editing. It pauses with the theme's motion off, for
 * visitors who ask for less motion, and while a pointer is over it.
 */
export const Marquee = (props: {
  readonly items: ReactNode;
  readonly copies: ReactNode;
  readonly className?: string;
}) => (
  <div className="marquee">
    <div className="marquee-track">
      <div className={cx("flex shrink-0 items-center", props.className)}>{props.items}</div>
      <div aria-hidden className={cx("flex shrink-0 items-center", props.className)}>
        {props.copies}
      </div>
    </div>
  </div>
);
