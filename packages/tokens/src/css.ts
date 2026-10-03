import { parseOklch } from "./color.ts";
import { fontFaces, fontStack, type FontId } from "./fonts.ts";
import {
  type ColorScheme,
  type ResolvedTheme,
  type SchemeColors,
  Surface,
  type SurfaceColors,
} from "./theme.ts";

/*
 * Sizes grow with the viewport between a phone and a large screen, from the
 * first value of each pair to the second, so a page's type and spacing are
 * set for both without breakpoints.
 */

const narrowest = 22.5;
const widest = 90;

type Range = readonly [number, number];

const rem = (value: number) => `${Number(value.toFixed(4))}rem`;

/** A size that grows from `min` rem at a phone's width to `max` rem at a large screen's. */
const fluid = ([min, max]: Range) => {
  if (min === max) return rem(min);
  const slope = (max - min) / (widest - narrowest);
  const base = min - slope * narrowest;
  return `clamp(${rem(min)}, ${rem(base)} + ${Number((slope * 100).toFixed(4))}vw, ${rem(max)})`;
};

interface TypeScale {
  readonly small: number;
  readonly body: number;
  readonly lead: Range;
  readonly heading: Range;
  readonly title: Range;
  readonly display: Range;
  readonly jumbo: Range;
}

const typeScales = {
  "x-small": {
    small: 0.8125,
    body: 0.9375,
    lead: [1, 1.0625],
    heading: [1.0625, 1.125],
    title: [1.375, 1.625],
    display: [1.75, 2.25],
    jumbo: [2.25, 3.5],
  },
  small: {
    small: 0.875,
    body: 1,
    lead: [1.0625, 1.1875],
    heading: [1.125, 1.3125],
    title: [1.625, 2.25],
    display: [2.25, 3.5],
    jumbo: [2.75, 5],
  },
  medium: {
    small: 0.875,
    body: 1,
    lead: [1.125, 1.3125],
    heading: [1.1875, 1.4375],
    title: [1.875, 2.875],
    display: [2.5, 4.5],
    jumbo: [3.25, 7],
  },
  large: {
    small: 0.9375,
    body: 1.0625,
    lead: [1.1875, 1.4375],
    heading: [1.25, 1.625],
    title: [2.125, 3.5],
    display: [2.75, 5.75],
    jumbo: [3.5, 9],
  },
  "x-large": {
    small: 0.9375,
    body: 1.0625,
    lead: [1.25, 1.5],
    heading: [1.375, 1.875],
    title: [2.375, 4.25],
    display: [3, 7.5],
    jumbo: [3.75, 11],
  },
} as const satisfies Record<ResolvedTheme["typeScale"], TypeScale>;

/** Letter spacing by heading size, and the case headings are set in. */
/*
 * `glyph` is about how wide a heading letter runs, tracking included, so a
 * line of known length can be sized to fill a width.
 */
const headingStyles = {
  tight: {
    heading: "-0.015em",
    title: "-0.03em",
    display: "-0.04em",
    case: "none",
    glyph: "0.56",
  },
  normal: {
    heading: "-0.005em",
    title: "-0.015em",
    display: "-0.02em",
    case: "none",
    glyph: "0.58",
  },
  uppercase: {
    heading: "0.04em",
    title: "0.03em",
    display: "0.02em",
    case: "uppercase",
    glyph: "0.74",
  },
} as const satisfies Record<ResolvedTheme["headingStyle"], Record<string, string>>;

/** How the short lines above headings and on badges are set. */
const labelStyles = {
  plain: {
    transform: "none",
    tracking: "0em",
    weight: "500",
    padding: "0rem",
    border: "0px",
  },
  uppercase: {
    transform: "uppercase",
    tracking: "0.08em",
    weight: "600",
    padding: "0rem",
    border: "0px",
  },
  pill: {
    transform: "none",
    tracking: "0em",
    weight: "500",
    padding: "0.75rem",
    border: "1px",
  },
  mono: {
    transform: "uppercase",
    tracking: "0.04em",
    weight: "400",
    padding: "0rem",
    border: "0px",
  },
} as const satisfies Record<ResolvedTheme["labelStyle"], Record<string, string>>;

const radii = {
  none: "0rem",
  small: "0.375rem",
  medium: "0.625rem",
  large: "1rem",
} as const satisfies Record<ResolvedTheme["radius"], string>;

const imageRadii = {
  square: "0rem",
  rounded: "0.75rem",
  "extra-rounded": "1.75rem",
} as const satisfies Record<ResolvedTheme["imageCorners"], string>;

const raisedShadow =
  "0 1px 2px oklch(0 0 0 / 5%), 0 6px 16px -4px oklch(0 0 0 / 8%), 0 16px 40px -12px oklch(0 0 0 / 10%)";

const densities = {
  compact: { unit: "0.225rem", section: [3.5, 5.5] },
  comfortable: { unit: "0.25rem", section: [4.5, 8] },
  spacious: { unit: "0.275rem", section: [5.5, 11] },
} as const satisfies Record<
  ResolvedTheme["density"],
  { readonly unit: string; readonly section: Range }
>;

const widths = {
  narrow: "68rem",
  regular: "76rem",
  wide: "88rem",
} as const satisfies Record<ResolvedTheme["width"], string>;

/** The font of labels in the monospace label style. */
const labelFont: FontId = "geist-mono";

const declarations = (entries: ReadonlyArray<readonly [string, string]>) =>
  entries.map(([name, value]) => `  --${name}: ${value};`).join("\n");

/**
 * A surface's colors, which of a brand's two logos shows on it, and the
 * outline of its cards. Each surface declares its own, so what's inside a
 * section reads the section's colors.
 */
const surfaceDeclarations = (colors: SurfaceColors, cards: ResolvedTheme["cards"]) => {
  const dark = parseOklch(colors.background).l < 0.6;
  return declarations([
    ...Object.entries(colors).map(([name, value]) => [name, value] as const),
    ["theme-on-light", dark ? "none" : "inline-block"],
    ["theme-on-dark", dark ? "inline-block" : "none"],
    ["theme-logo-ink", dark ? "brightness(0) invert(1)" : "brightness(0)"],
    [
      "theme-card-border",
      { outline: colors.border, filled: "transparent", raised: colors.border }[cards],
    ],
  ]);
};

/**
 * The selector of the elements a surface re-scopes, inside `root` unless
 * that's the page: those set to it, and a header overlaid on a first section
 * set to it, so the header reads on whatever it sits over. On a site the
 * header and each section sit in a hydration marker of their own.
 */
const surfaceSelector = (root: string, surface: string) => {
  const scope = root === ":root" ? "" : `${root} `;
  const marker = "[data-ts-hydrate-id]";
  return [
    `${scope}[data-surface="${surface}"]`,
    `${scope}:has(+ main > [data-surface="${surface}"]:first-child) > [data-overlay]`,
    `${scope}${marker}:has(+ main > ${marker}:first-child > [data-surface="${surface}"]) > * > [data-overlay]`,
  ].join(", ");
};

const schemeRules = (
  scheme: SchemeColors,
  colorScheme: ColorScheme,
  cards: ResolvedTheme["cards"],
  root: string,
) =>
  [
    `${root} {\n  color-scheme: ${colorScheme};\n${surfaceDeclarations(scheme.default, cards)}\n}`,
    ...Surface.literals.map(
      (surface) =>
        `${surfaceSelector(root, surface)} {\n${surfaceDeclarations(scheme[surface], cards)}\n}`,
    ),
  ].join("\n");

/** The fonts a theme loads: its heading and body fonts, and its labels' when they have their own. */
const themeFonts = (theme: ResolvedTheme) =>
  new Set<FontId>([
    theme.fonts.heading,
    theme.fonts.body,
    ...(theme.labelStyle === "mono" ? [labelFont] : []),
  ]);

/** The `@font-face` rules that load a theme's fonts. */
export const themeFontFaces = (theme: ResolvedTheme) =>
  Array.from(themeFonts(theme), fontFaces).join("\n");

/** The scheme pages show: the theme's own, or the visitor's when the theme follows it. */
const fixedScheme = (theme: ResolvedTheme): ColorScheme | undefined =>
  theme.colorMode === "system" ? undefined : theme.colorMode;

/** The rules that set a theme's variables on `root` and the surfaces inside it. */
const variableRules = (theme: ResolvedTheme, scheme: ColorScheme | undefined, root: string) => {
  const type = typeScales[theme.typeScale];
  const heading = headingStyles[theme.headingStyle];
  const label = labelStyles[theme.labelStyle];
  const density = densities[theme.density];
  const shared = declarations([
    ["theme-font-heading", fontStack(theme.fonts.heading)],
    ["theme-font-body", fontStack(theme.fonts.body)],
    ["theme-heading-weight", String(theme.headingWeight)],
    ["theme-heading-case", heading.case],
    ["theme-heading-glyph", heading.glyph],
    ["theme-text-small", rem(type.small)],
    ["theme-text-body", rem(type.body)],
    ["theme-text-lead", fluid(type.lead)],
    ["theme-text-heading", fluid(type.heading)],
    ["theme-text-title", fluid(type.title)],
    ["theme-text-display", fluid(type.display)],
    ["theme-text-jumbo", fluid(type.jumbo)],
    ["theme-tracking-heading", heading.heading],
    ["theme-tracking-title", heading.title],
    ["theme-tracking-display", heading.display],
    ["theme-label-font", theme.labelStyle === "mono" ? fontStack(labelFont) : "inherit"],
    ["theme-label-transform", label.transform],
    ["theme-label-tracking", label.tracking],
    ["theme-label-weight", label.weight],
    ["theme-label-padding", label.padding],
    ["theme-label-border", label.border],
    ["theme-radius", radii[theme.radius]],
    ["theme-button-radius", theme.buttons === "pill" ? "999px" : radii[theme.radius]],
    ["theme-image-radius", imageRadii[theme.imageCorners]],
    ["theme-shadow", theme.cards === "raised" ? raisedShadow : "none"],
    ["theme-spacing", density.unit],
    ["theme-section-space", fluid(density.section)],
    ["theme-gutter", fluid([1.25, 2.5])],
    ["theme-width", widths[theme.width]],
    ["theme-motion-duration", theme.motion ? "180ms" : "0ms"],
    ["theme-animation", theme.motion ? "running" : "paused"],
    // With motion off, a moving row stands still and scrolls sideways instead.
    ["theme-marquee-overflow", theme.motion ? "hidden" : "auto"],
    ["theme-marquee-copies", theme.motion ? "flex" : "none"],
    ["theme-lines", theme.lines ? "1px" : "0px"],
    ["theme-section-entrance", theme.motion ? "pakshi-section-entrance" : "none"],
  ]);
  const fixed = fixedScheme(theme) ?? scheme;
  const colors =
    fixed === undefined
      ? [
          schemeRules(theme.colors.light, "light", theme.cards, root),
          `@media (prefers-color-scheme: dark) {\n${schemeRules(theme.colors.dark, "dark", theme.cards, root)}\n}`,
        ]
      : [schemeRules(theme.colors[fixed], fixed, theme.cards, root)];
  return [`${root} {\n${shared}\n}`, ...colors].join("\n");
};

/**
 * The CSS variables a site's pages read for one resolved theme. Every site
 * shares one Tailwind build that maps these variables to utilities, so sites
 * differ only in these and their fonts.
 *
 * Pages show the theme's color scheme, or follow the visitor's when the
 * theme does. Pass `scheme` to fix one for a theme that follows the
 * visitor's, as the editor's canvas does when someone switches between light
 * and dark.
 */
export const themeVariables = (theme: ResolvedTheme, scheme?: ColorScheme) =>
  variableRules(theme, scheme, ":root");

/** A theme's whole CSS, as a page loads it: its fonts' faces and its variables. */
export const themeCss = (theme: ResolvedTheme, scheme?: ColorScheme) =>
  `${themeFontFaces(theme)}\n${themeVariables(theme, scheme)}`;

/**
 * A theme's variables in one color scheme, set only inside the elements
 * `scope` matches, so a page can show several themes side by side. Its
 * surfaces are elements inside the scope with a `data-surface` attribute,
 * as on a site's pages.
 */
export const scopedThemeVariables = (theme: ResolvedTheme, scheme: ColorScheme, scope: string) =>
  variableRules(theme, scheme, scope);

/** The schemes someone can see a theme in: its own, or both when it follows the visitor. */
export const themeSchemes = (theme: ResolvedTheme): ReadonlyArray<ColorScheme> => {
  const fixed = fixedScheme(theme);
  return fixed === undefined ? ["light", "dark"] : [fixed];
};
