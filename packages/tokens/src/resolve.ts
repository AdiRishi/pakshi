import { contrastIssues, generatePalette } from "./palette.ts";
import type { ResolvedTheme, ThemeValues } from "./theme.ts";

/**
 * The theme pages render with, its palettes generated from the brand's
 * values, and every pair of its colors too hard to read. A theme with issues
 * can't be saved.
 */
export const resolveTheme = ({ brandColor, accentColor, neutral, ...style }: ThemeValues) => {
  const colors = generatePalette({ brandColor, accentColor, neutral, cards: style.cards });
  const resolved: ResolvedTheme = { schema: "pakshi.theme/2", colors, ...style };
  return { theme: resolved, issues: contrastIssues(colors) };
};
