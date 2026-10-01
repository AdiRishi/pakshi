import { Record } from "effect";

import { contrast, formatOklch, hexToOklch, type Oklch, parseOklch, toGamut } from "./color.ts";
import type {
  ColorName,
  ColorScheme,
  ContrastIssue,
  NeutralTone,
  ResolvedTheme,
  SchemeColors,
  Surface,
  SurfaceColors,
} from "./theme.ts";

/*
 * A theme's light and dark palettes, generated from one brand color and the
 * tone of its grays. Text colors are moved in lightness until they read
 * clearly on what's behind them. The brand color itself is kept as the light
 * scheme's buttons and links, so a brand color too light to read on a light
 * page fails the contrast check rather than being changed behind someone's
 * back.
 */

/** The hue grays lean towards, and how far, for each tone. A neutral tone follows the brand's hue. */
const tones = {
  cool: () => ({ h: 250, c: 0.016 }),
  neutral: (brand: Oklch) => ({ h: brand.h, c: 0.005 }),
  warm: () => ({ h: 75, c: 0.013 }),
} as const satisfies Record<NeutralTone, (brand: Oklch) => { h: number; c: number }>;

const textContrast = 4.5;

/** A color as a theme stores it, rounded, which is the color pages show. */
const shown = (color: Oklch) => parseOklch(formatOklch(color));
const uiContrast = 3;

/**
 * `preferred`, or the nearest color in lightness to it that reaches `ratio`
 * against every color in `behind`: darker on light backgrounds, lighter on
 * dark ones.
 */
const readable = (preferred: Oklch, behind: ReadonlyArray<Oklch>, ratio = textContrast) => {
  const reads = (color: Oklch) =>
    behind.every((back) => contrast(shown(color), shown(back)) >= ratio);
  const lightBehind = (behind[0]?.l ?? 1) > 0.6;
  let color = toGamut(preferred);
  while (!reads(color) && color.l > 0 && color.l < 1)
    color = toGamut({ ...color, l: color.l + (lightBehind ? -0.01 : 0.01) });
  return color;
};

/** Whichever of a light and a dark text color reads better on `background`, made to read well. */
const textOn = (background: Oklch, light: Oklch, dark: Oklch) =>
  readable(contrast(light, background) >= contrast(dark, background) ? light : dark, [background]);

interface SurfacePlan {
  readonly background: Oklch;
  readonly muted: Oklch;
  readonly border: Oklch;
  readonly foreground: Oklch;
  readonly mutedForeground: Oklch;
  readonly primary: Oklch;
  /** The color of form field outlines, which must stand out from the background. */
  readonly input: Oklch;
}

const destructive = {
  light: { l: 0.53, c: 0.2, h: 27 },
  dark: { l: 0.72, c: 0.17, h: 27 },
} as const satisfies Record<ColorScheme, Oklch>;

const surfaceColors = (plan: SurfacePlan, scheme: ColorScheme): SurfaceColors => {
  const behind = [plan.background, plan.muted];
  const foreground = readable(plan.foreground, behind);
  const mutedForeground = readable(plan.mutedForeground, behind);
  const primaryForeground = textOn(plan.primary, plan.background, foreground);
  const colors = {
    background: plan.background,
    foreground,
    card: plan.background,
    "card-foreground": foreground,
    popover: plan.background,
    "popover-foreground": foreground,
    primary: plan.primary,
    "primary-foreground": primaryForeground,
    secondary: plan.muted,
    "secondary-foreground": foreground,
    muted: plan.muted,
    "muted-foreground": mutedForeground,
    accent: plan.muted,
    "accent-foreground": foreground,
    destructive: readable(destructive[scheme], [plan.background]),
    border: plan.border,
    input: readable(plan.input, [plan.background], uiContrast),
    ring: plan.primary,
  } satisfies Record<ColorName, Oklch>;
  return Record.map(colors, formatOklch);
};

/** A surface whose background is a shade of the brand: its button is its text color, reversed. */
const brandSurface = (background: Oklch, light: Oklch, dark: Oklch): SurfacePlan => {
  const foreground = textOn(background, light, dark);
  const toward = Math.sign(foreground.l - background.l);
  const muted = toGamut({ ...background, l: background.l + toward * 0.05 });
  return {
    background,
    muted,
    border: toGamut({ ...background, l: background.l + toward * 0.14 }),
    foreground,
    mutedForeground: { ...foreground, l: foreground.l - toward * 0.12 },
    primary: foreground,
    input: { ...foreground, l: foreground.l - toward * 0.25 },
  };
};

/** The light and dark palettes for a brand color and neutral tone. */
export const generatePalette = (
  brandColor: string,
  neutral: NeutralTone,
): ResolvedTheme["colors"] => {
  const brand = toGamut(hexToOklch(brandColor));
  const tone = tones[neutral](brand);
  const gray = (l: number, chroma = 1): Oklch => ({ l, c: tone.c * chroma, h: tone.h });
  const tinted = (l: number, maxChroma: number): Oklch =>
    toGamut({ l, c: Math.min(brand.c, maxChroma), h: brand.h });

  const lightText = gray(0.985, 0.3);
  const darkText = gray(0.2, 1.5);
  const light = (surface: Surface): SurfacePlan => {
    switch (surface) {
      case "default":
      case "muted": {
        const background = surface === "default" ? gray(0.99, 0.3) : gray(0.955, 0.7);
        return {
          background,
          muted: gray(background.l - 0.035, 0.9),
          border: gray(background.l - 0.1, 1),
          foreground: gray(0.22, 1.5),
          mutedForeground: gray(0.46, 1.3),
          primary: brand,
          input: gray(0.6, 1),
        };
      }
      case "brand":
        return brandSurface(brand, lightText, darkText);
      case "inverse":
        return {
          background: gray(0.22, 1.5),
          muted: gray(0.28, 1.5),
          border: gray(0.36, 1.2),
          foreground: gray(0.97, 0.4),
          mutedForeground: gray(0.8, 1),
          primary: readable(tinted(0.8, 0.13), [gray(0.22, 1.5), gray(0.28, 1.5)]),
          input: gray(0.55, 1),
        };
    }
  };
  const dark = (surface: Surface): SurfacePlan => {
    switch (surface) {
      case "default":
      case "muted": {
        const background = surface === "default" ? gray(0.19, 1.2) : gray(0.23, 1.2);
        const muted = gray(background.l + 0.05, 1.2);
        return {
          background,
          muted,
          border: gray(background.l + 0.13, 1.2),
          foreground: gray(0.95, 0.4),
          mutedForeground: gray(0.76, 1),
          primary: readable(tinted(Math.max(brand.l, 0.74), 0.15), [background, muted]),
          input: gray(0.5, 1),
        };
      }
      case "brand":
        return brandSurface(tinted(Math.min(brand.l, 0.4), 0.14), lightText, darkText);
      case "inverse":
        return {
          background: gray(0.95, 0.4),
          muted: gray(0.91, 0.6),
          border: gray(0.85, 0.8),
          foreground: gray(0.22, 1.5),
          mutedForeground: gray(0.44, 1.3),
          primary: readable(tinted(Math.min(brand.l, 0.5), 0.15), [
            gray(0.95, 0.4),
            gray(0.91, 0.6),
          ]),
          input: gray(0.6, 1),
        };
    }
  };
  const scheme = (plan: (surface: Surface) => SurfacePlan, name: ColorScheme): SchemeColors => ({
    default: surfaceColors(plan("default"), name),
    muted: surfaceColors(plan("muted"), name),
    brand: surfaceColors(plan("brand"), name),
    inverse: surfaceColors(plan("inverse"), name),
  });
  return { light: scheme(light, "light"), dark: scheme(dark, "dark") };
};

/** A pair of colors a page shows one on the other, and the contrast it needs. */
interface Pair {
  readonly color: ColorName;
  readonly on: ColorName;
  readonly ratio: number;
  /** What the pair is, for someone choosing a theme. */
  readonly what: string;
}

const pairs: ReadonlyArray<Pair> = [
  { color: "foreground", on: "background", ratio: textContrast, what: "Text" },
  { color: "foreground", on: "muted", ratio: textContrast, what: "Text on shaded panels" },
  { color: "muted-foreground", on: "background", ratio: textContrast, what: "Secondary text" },
  {
    color: "muted-foreground",
    on: "muted",
    ratio: textContrast,
    what: "Secondary text on shaded panels",
  },
  { color: "card-foreground", on: "card", ratio: textContrast, what: "Text on cards" },
  { color: "popover-foreground", on: "popover", ratio: textContrast, what: "Text in menus" },
  { color: "primary-foreground", on: "primary", ratio: textContrast, what: "Button text" },
  { color: "primary", on: "background", ratio: textContrast, what: "Links and outlined buttons" },
  {
    color: "secondary-foreground",
    on: "secondary",
    ratio: textContrast,
    what: "Secondary buttons",
  },
  { color: "accent-foreground", on: "accent", ratio: textContrast, what: "Highlighted text" },
  { color: "destructive", on: "background", ratio: textContrast, what: "Error messages" },
  { color: "input", on: "background", ratio: uiContrast, what: "Form field outlines" },
  { color: "ring", on: "background", ratio: uiContrast, what: "Focus outlines" },
];

/** Every pair of colors in a theme, in both schemes and on every surface, that's hard to read. */
export const contrastIssues = (colors: ResolvedTheme["colors"]): ReadonlyArray<ContrastIssue> =>
  (["light", "dark"] as const).flatMap((scheme) =>
    (["default", "muted", "brand", "inverse"] as const).flatMap((surface) => {
      const palette = colors[scheme][surface];
      return pairs.flatMap((pair) => {
        const ratio = contrast(parseOklch(palette[pair.color]), parseOklch(palette[pair.on]));
        return ratio >= pair.ratio
          ? []
          : [
              {
                scheme,
                surface,
                color: pair.color,
                on: pair.on,
                what: pair.what,
                ratio: Math.floor(ratio * 100) / 100,
                required: pair.ratio,
              },
            ];
      });
    }),
  );
