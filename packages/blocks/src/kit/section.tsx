import { cx } from "class-variance-authority";
import type { ReactNode } from "react";

import { Root } from "../components.tsx";

/** What sits behind a section's content: nothing, or a glow, a pattern or grain. */
export type Backdrop = "none" | "glow" | "arc" | "grid" | "dots" | "stripes" | "noise";

const backdrops = {
  none: "",
  glow: "decor-glow",
  arc: "decor-arc",
  grid: "decor-grid",
  dots: "decor-dots",
  stripes: "decor-stripes",
  noise: "decor-noise",
} as const satisfies Record<Backdrop, string>;

/**
 * A page section: its surface's background and text, the theme's spacing
 * above and below, and a backdrop behind its content. Its children set their
 * own width, usually `page-width`.
 *
 * An inset section draws its background as a rounded panel a little in from
 * the page's edges, on the page's own background. A full one starts closer
 * to a section on the same surface above it.
 */
export const Section = (props: {
  readonly backdrop?: Backdrop | undefined;
  readonly background?: "full" | "inset" | undefined;
  /** Whether the section keeps the theme's space above and below, or sits flush. */
  readonly spacing?: "section" | "flush";
  readonly className?: string;
  readonly children: ReactNode;
}) => {
  const flush = props.spacing === "flush";
  const body = cx(
    "relative isolate overflow-clip bg-background text-foreground",
    backdrops[props.backdrop ?? "none"],
    props.className,
  );
  return props.background === "inset" ? (
    <Root className="px-2 py-1 text-foreground sm:px-3">
      <div className={cx(body, "rounded-xl", !flush && "py-section")}>{props.children}</div>
    </Root>
  ) : (
    <Root className={cx(body, !flush && "section-space")}>{props.children}</Root>
  );
};
