import type { ResolvedTheme, SchemeColors, SurfaceColors } from "./theme.ts";

const typeRatios = {
  "minor-third": 1.2,
  "major-third": 1.25,
  "perfect-fourth": 1.333,
} as const satisfies Record<ResolvedTheme["typeScale"], number>;

const radii = {
  none: "0rem",
  small: "0.25rem",
  medium: "0.5rem",
  large: "1rem",
} as const satisfies Record<ResolvedTheme["radius"], string>;

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

const colorDeclarations = (colors: SurfaceColors) =>
  declarations(Object.entries(colors).map(([name, value]) => [name, value] as const));

const schemeRules = (scheme: SchemeColors, colorScheme: "light" | "dark") =>
  [
    `:root {\n  color-scheme: ${colorScheme};\n${colorDeclarations(scheme.default)}\n}`,
    ...(["default", "muted", "brand", "inverse"] as const).map(
      (surface) => `[data-surface="${surface}"] {\n${colorDeclarations(scheme[surface])}\n}`,
    ),
  ].join("\n");

/**
 * The CSS variables a site's pages read, for one resolved theme. Every site
 * shares one Tailwind build that maps these variables to utilities, so sites
 * differ only in this file.
 */
export const themeCss = (theme: ResolvedTheme) => {
  const ratio = typeRatios[theme.typeScale];
  const density = densities[theme.density];
  const shared = declarations([
    ["theme-font-heading", theme.fonts.heading],
    ["theme-font-body", theme.fonts.body],
    ["theme-heading-weight", String(theme.headingWeight)],
    ["theme-text-small", rem(1 / ratio)],
    ["theme-text-body", rem(1)],
    ["theme-text-lead", rem(ratio)],
    ["theme-text-heading", rem(ratio ** 2)],
    ["theme-text-title", rem(ratio ** 3)],
    ["theme-text-display", rem(ratio ** 4)],
    ["theme-radius", radii[theme.radius]],
    ["theme-image-radius", theme.imageCorners === "rounded" ? "0.75rem" : "0rem"],
    ["theme-shadow", shadows[theme.shadow]],
    ["theme-spacing", density.unit],
    ["theme-section-space", density.section],
    ["theme-motion-duration", theme.motion ? "180ms" : "0ms"],
  ]);
  return [
    `:root {\n${shared}\n}`,
    schemeRules(theme.colors.light, "light"),
    `@media (prefers-color-scheme: dark) {\n${schemeRules(theme.colors.dark, "dark")}\n}`,
  ].join("\n");
};
