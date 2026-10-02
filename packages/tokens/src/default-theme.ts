import type { ThemeValues } from "./theme.ts";

/**
 * The theme a new brand starts from, with its own brand color. Brands store
 * every value, so changing this changes only brands made afterwards.
 */
export const defaultTheme: ThemeValues = {
  brandColor: "#125ca1",
  accentColor: null,
  neutral: "warm",
  colorMode: "light",
  fonts: { heading: "literata", body: "work-sans" },
  typeScale: "medium",
  headingWeight: 600,
  headingStyle: "normal",
  labelStyle: "plain",
  radius: "small",
  buttons: "rounded",
  cards: "outline",
  density: "comfortable",
  width: "regular",
  imageCorners: "rounded",
  motion: true,
  lines: false,
};
