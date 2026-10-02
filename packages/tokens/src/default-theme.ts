import type { ThemeValues } from "./theme.ts";

/**
 * The theme a new brand starts from, with its own brand color: a serif display
 * face over a quiet sans-serif, on warm grays. Brands store every value, so
 * changing this changes only brands made afterwards.
 */
export const defaultTheme: ThemeValues = {
  brandColor: "#125ca1",
  neutral: "warm",
  fonts: { heading: "literata", body: "work-sans" },
  typeScale: "medium",
  headingWeight: 600,
  radius: "small",
  shadow: "soft",
  density: "comfortable",
  imageCorners: "rounded",
  motion: true,
};
