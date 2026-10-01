import { parseOklch } from "./color.ts";
import { fontFaces, fontStack } from "./fonts.ts";
import type { ColorScheme, ResolvedTheme, SchemeColors, SurfaceColors } from "./theme.ts";

const typeRatios = {
  small: 1.2,
  medium: 1.25,
  large: 1.333,
} as const satisfies Record<ResolvedTheme["typeScale"], number>;

const radii = {
  none: "0rem",
  small: "0.25rem",
  medium: "0.5rem",
  large: "1rem",
} as const satisfies Record<ResolvedTheme["radius"], string>;

const imageRadii = {
  square: "0rem",
  rounded: "0.75rem",
  "extra-rounded": "1.75rem",
} as const satisfies Record<ResolvedTheme["imageCorners"], string>;

const shadows = {
  flat: "none",
  soft: "0 1px 2px oklch(0 0 0 / 6%), 0 4px 12px oklch(0 0 0 / 6%)",
  raised: "0 2px 4px oklch(0 0 0 / 10%), 0 12px 28px oklch(0 0 0 / 14%)",
} as const satisfies Record<ResolvedTheme["shadow"], string>;

const densities = {
  compact: { unit: "0.225rem", section: "3.5rem" },
  comfortable: { unit: "0.25rem", section: "5rem" },
  spacious: { unit: "0.275rem", section: "7rem" },
} as const satisfies Record<ResolvedTheme["density"], { unit: string; section: string }>;

const rem = (value: number) => `${Number(value.toFixed(3))}rem`;

const declarations = (entries: ReadonlyArray<readonly [string, string]>) =>
  entries.map(([name, value]) => `  --${name}: ${value};`).join("\n");

/**
 * A surface's colors, and which of a brand's two logos shows on it: the one
 * for dark backgrounds when its background is dark.
 */
const colorDeclarations = (colors: SurfaceColors) => {
  const dark = parseOklch(colors.background).l < 0.6;
  return declarations([
    ...Object.entries(colors).map(([name, value]) => [name, value] as const),
    ["theme-on-light", dark ? "none" : "inline-block"],
    ["theme-on-dark", dark ? "inline-block" : "none"],
  ]);
};

const schemeRules = (scheme: SchemeColors, colorScheme: ColorScheme) =>
  [
    `:root {\n  color-scheme: ${colorScheme};\n${colorDeclarations(scheme.default)}\n}`,
    ...(["default", "muted", "brand", "inverse"] as const).map(
      (surface) => `[data-surface="${surface}"] {\n${colorDeclarations(scheme[surface])}\n}`,
    ),
  ].join("\n");

/** The `@font-face` rules that load a theme's heading and body fonts. */
export const themeFontFaces = (theme: ResolvedTheme) =>
  Array.from(new Set([theme.fonts.heading, theme.fonts.body]), fontFaces).join("\n");

/**
 * The CSS variables a site's pages read for one resolved theme. Every site
 * shares one Tailwind build that maps these variables to utilities, so sites
 * differ only in these and their fonts.
 *
 * Pages follow the visitor's color scheme. Pass `scheme` to fix one instead,
 * as the editor's canvas does when someone switches between light and dark.
 */
export const themeVariables = (theme: ResolvedTheme, scheme?: ColorScheme) => {
  const ratio = typeRatios[theme.typeScale];
  const density = densities[theme.density];
  const shared = declarations([
    ["theme-font-heading", fontStack(theme.fonts.heading)],
    ["theme-font-body", fontStack(theme.fonts.body)],
    ["theme-heading-weight", String(theme.headingWeight)],
    ["theme-text-small", rem(1 / ratio)],
    ["theme-text-body", rem(1)],
    ["theme-text-lead", rem(ratio)],
    ["theme-text-heading", rem(ratio ** 2)],
    ["theme-text-title", rem(ratio ** 3)],
    ["theme-text-display", rem(ratio ** 4)],
    ["theme-radius", radii[theme.radius]],
    ["theme-image-radius", imageRadii[theme.imageCorners]],
    ["theme-shadow", shadows[theme.shadow]],
    ["theme-spacing", density.unit],
    ["theme-section-space", density.section],
    ["theme-motion-duration", theme.motion ? "180ms" : "0ms"],
    ["theme-section-entrance", theme.motion ? "pakshi-section-entrance" : "none"],
  ]);
  const colors =
    scheme === undefined
      ? [
          schemeRules(theme.colors.light, "light"),
          `@media (prefers-color-scheme: dark) {\n${schemeRules(theme.colors.dark, "dark")}\n}`,
        ]
      : [schemeRules(theme.colors[scheme], scheme)];
  return [`:root {\n${shared}\n}`, ...colors].join("\n");
};

/** A theme's whole CSS, as a page loads it: its fonts' faces and its variables. */
export const themeCss = (theme: ResolvedTheme, scheme?: ColorScheme) =>
  `${themeFontFaces(theme)}\n${themeVariables(theme, scheme)}`;
