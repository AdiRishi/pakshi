import type { ColorScheme, Surface } from "@repo/tokens";

export const schemeTitles = {
  light: "Light",
  dark: "Dark",
} as const satisfies Record<ColorScheme, string>;

/** What each surface is on a page, for someone choosing colors. */
export const surfaceTitles = {
  default: "page background",
  muted: "shaded sections",
  tint: "brand-tinted sections",
  brand: "brand-colored sections",
  accent: "accent-colored sections",
  inverse: "reversed sections",
} as const satisfies Record<Surface, string>;
