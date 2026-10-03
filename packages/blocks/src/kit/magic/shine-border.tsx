import { useMotion } from "../../components.tsx";
import { cn } from "../cn.ts";

/**
 * Magic UI's shine border: a highlight in the theme's brand colors that
 * travels slowly round its parent's edge, for the one thing on a page that
 * should catch the eye. Its parent needs `relative` and its corners. It
 * stays still with motion off.
 */
export const ShineBorder = (props: { readonly className?: string }) => {
  const moving = useMotion();
  return (
    <div
      aria-hidden
      data-slot="shine-border"
      className={cn(
        "shine-border pointer-events-none absolute inset-0 size-full rounded-inherit [--border-width:2px] [--duration:14s]",
        moving && "motion-safe:animate-shine",
        props.className,
      )}
    />
  );
};
