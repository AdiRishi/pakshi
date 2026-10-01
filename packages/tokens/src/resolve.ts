import { contrastIssues, generatePalette } from "./palette.ts";
import { presets } from "./presets.ts";
import type { BrandTheme, ResolvedTheme, ThemeValues } from "./theme.ts";

/** A brand theme's values: its preset's, with the brand's changes on top. */
export const themeValues = (theme: BrandTheme): ThemeValues => ({
  ...presets[theme.preset],
  ...theme.changes,
});

/**
 * The theme pages render with, its palettes generated from the brand's
 * values, and every pair of its colors too hard to read. A theme with issues
 * can't be saved.
 */
export const resolveTheme = (theme: BrandTheme) => {
  const { brandColor, neutral, ...style } = themeValues(theme);
  const colors = generatePalette(brandColor, neutral);
  const resolved: ResolvedTheme = { schema: "pakshi.theme/1", colors, ...style };
  return { theme: resolved, issues: contrastIssues(colors) };
};
