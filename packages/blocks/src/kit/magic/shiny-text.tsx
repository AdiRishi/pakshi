import type { ReactNode } from "react";

import { useMotion } from "../../components.tsx";
import { cn } from "../cn.ts";

/**
 * Magic UI's animated shiny text: quiet text that a band of light sweeps
 * across now and then, for a short label above a heading.
 */
export const ShinyText = (props: { readonly className?: string; readonly children: ReactNode }) => {
  const moving = useMotion();
  return (
    <span
      data-slot="shiny-text"
      className={cn(
        "text-muted-foreground",
        moving &&
          "bg-linear-to-r from-transparent via-foreground/80 via-50% to-transparent bg-size-[var(--shiny-width)_100%] bg-clip-text bg-position-[0_0] bg-no-repeat [--shiny-width:6rem] motion-safe:animate-shiny-text",
        props.className,
      )}
    >
      {props.children}
    </span>
  );
};
