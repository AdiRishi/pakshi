import type { PointerEvent, ReactNode } from "react";

import { useMotion } from "../../components.tsx";
import { cn } from "../cn.ts";

const follow = (event: PointerEvent<HTMLElement>) => {
  const box = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--magic-x", `${event.clientX - box.left}px`);
  event.currentTarget.style.setProperty("--magic-y", `${event.clientY - box.top}px`);
};

/**
 * Magic UI's magic card: a card whose border and surface light up in the
 * brand's colors around the pointer as it moves over it. `as` keeps the
 * element a block needs, such as a list item.
 */
export const MagicCard = (props: {
  readonly as?: "div" | "li" | "article";
  readonly className?: string;
  readonly children: ReactNode;
}) => {
  const moving = useMotion();
  const Element = props.as ?? "div";
  return (
    <Element
      data-slot="magic-card"
      onPointerMove={moving ? follow : undefined}
      className={cn("group/magic relative isolate", moving && "magic-card", props.className)}
    >
      {props.children}
    </Element>
  );
};
