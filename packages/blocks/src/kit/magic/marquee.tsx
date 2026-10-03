import type { ReactNode } from "react";

import { useMotion } from "../../components.tsx";
import { cn } from "../cn.ts";

/**
 * Magic UI's marquee: a row that scrolls by itself and loops without a gap.
 * `items` are the editable originals, and `copies` the same items drawn
 * again for the loop, hidden from screen readers. It pauses while a pointer
 * or keyboard focus is in it. With the theme's motion off, for visitors who
 * ask for less motion, or in the editor, it stands still as a row that
 * scrolls sideways, so every item can still be reached.
 */
export const Marquee = (props: {
  readonly items: ReactNode;
  readonly copies: ReactNode;
  readonly reverse?: boolean;
  /** Seconds one loop takes. */
  readonly speed?: "slow" | "normal";
  readonly className?: string;
  readonly trackClassName?: string;
}) => {
  const moving = useMotion();
  const track = cn("flex shrink-0 items-center justify-around gap-(--gap)", props.trackClassName);
  return (
    <div
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a row that scrolls sideways needs focus for the keyboard to scroll it, as its items may hold no links
      tabIndex={0}
      data-slot="marquee"
      className={cn(
        "group flex gap-(--gap) [--gap:--spacing(8)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        props.speed === "slow" ? "[--duration:60s]" : "[--duration:40s]",
        moving
          ? "overflow-hidden motion-reduce:overflow-x-auto"
          : "overflow-x-auto [scrollbar-width:thin]",
        props.className,
      )}
    >
      <div
        className={cn(
          track,
          moving &&
            "motion-safe:animate-marquee group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused]",
          moving && props.reverse === true && "[animation-direction:reverse]",
        )}
      >
        {props.items}
      </div>
      {moving &&
        [0, 1, 2].map((copy) => (
          <div
            key={copy}
            aria-hidden
            className={cn(
              track,
              "motion-safe:animate-marquee motion-reduce:hidden group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused]",
              props.reverse === true && "[animation-direction:reverse]",
            )}
          >
            {props.copies}
          </div>
        ))}
    </div>
  );
};
