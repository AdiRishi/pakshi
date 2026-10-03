import { useMotionValueEvent, useScroll } from "motion/react";
import { useRef } from "react";

import { useMotion } from "../../components.tsx";
import { cn } from "../cn.ts";

const Rail = (props: { readonly className?: string | undefined }) => {
  const rail = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: rail, offset: ["start center", "end center"] });
  useMotionValueEvent(scrollYProgress, "change", (progress) =>
    rail.current?.style.setProperty("--scroll-progress", String(progress)),
  );
  return (
    <div
      ref={rail}
      aria-hidden
      data-slot="scroll-progress"
      className={cn(
        "pointer-events-none w-0.5 rounded-full bg-border [--scroll-progress:0] motion-reduce:hidden",
        props.className,
      )}
    >
      <div className="size-full origin-top scale-y-(--scroll-progress) rounded-full bg-linear-to-b from-primary to-accent" />
    </div>
  );
};

/**
 * Magic UI's scroll progress, as a rail beside what's being read rather than
 * a bar across the top of the window, where a sticky header would cover it.
 * Give it the height of the text, such as `absolute inset-y-0`. It fills
 * with the brand's colors as the text passes the middle of the window, so its
 * end always sits level with the line being read. With motion off it isn't
 * drawn.
 */
export const ScrollProgress = (props: { readonly className?: string }) =>
  useMotion() ? <Rail className={props.className} /> : null;
