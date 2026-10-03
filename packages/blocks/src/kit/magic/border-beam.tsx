import { motion } from "motion/react";

import { useMotion } from "../../components.tsx";
import { cn } from "../cn.ts";

/**
 * Magic UI's border beam: a short beam of the brand's colors that runs round
 * its parent's edge. Its parent needs `relative` and its corners. With motion
 * off it isn't drawn at all, as a still beam would read as a flaw.
 */
export const BorderBeam = (props: {
  /** Seconds one lap takes. */
  readonly duration?: number;
  readonly reverse?: boolean;
  readonly className?: string;
}) => {
  const moving = useMotion();
  if (!moving) return null;
  return (
    <div
      aria-hidden
      data-slot="border-beam"
      className="rounded-inherit pointer-events-none absolute inset-0 border-(length:--beam-width) border-transparent mask-[linear-gradient(transparent,transparent),linear-gradient(black,black)] mask-intersect [mask-clip:padding-box,border-box] [--beam-width:1.5px] motion-reduce:hidden"
    >
      <motion.div
        className={cn(
          "absolute aspect-square w-(--beam-size) bg-linear-to-l from-primary via-accent to-transparent [--beam-size:--spacing(20)] [offset-path:rect(0_auto_auto_0_round_var(--beam-size))]",
          props.className,
        )}
        initial={{ offsetDistance: "0%" }}
        animate={{ offsetDistance: props.reverse === true ? ["100%", "0%"] : ["0%", "100%"] }}
        transition={{ repeat: Infinity, ease: "linear", duration: props.duration ?? 8 }}
      />
    </div>
  );
};
