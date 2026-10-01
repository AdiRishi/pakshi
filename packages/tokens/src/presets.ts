import type { PresetId, ThemeValues } from "./theme.ts";

/**
 * The starting points a brand's theme is built on. A brand changes any value
 * on top of its preset, and keeps those changes if it picks another.
 */
export const presets = {
  /** Plain and direct, for public services: one sans-serif, square corners and no shadows. */
  civic: {
    brandColor: "#1f5c44",
    neutral: "cool",
    fonts: { heading: "source-sans-3", body: "source-sans-3" },
    typeScale: "medium",
    headingWeight: 700,
    radius: "small",
    shadow: "flat",
    density: "comfortable",
    imageCorners: "square",
    motion: false,
  },
  /** A serif display face over a quiet sans-serif, on warm grays. */
  editorial: {
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
  },
  /** Large, heavy headings with generous space and soft, round shapes. */
  bold: {
    brandColor: "#97271b",
    neutral: "neutral",
    fonts: { heading: "bricolage-grotesque", body: "onest" },
    typeScale: "large",
    headingWeight: 700,
    radius: "large",
    shadow: "raised",
    density: "spacious",
    imageCorners: "extra-rounded",
    motion: true,
  },
} as const satisfies Record<PresetId, ThemeValues>;

export const presetTitles = {
  civic: "Civic",
  editorial: "Editorial",
  bold: "Bold",
} as const satisfies Record<PresetId, string>;
