import { Schema, SchemaGetter } from "effect";

import { FontId } from "./fonts.ts";

/**
 * A section's background. `tint` is a pale wash of the brand color and
 * `accent` the brand's second color, or a light shade of its first.
 */
export const Surface = Schema.Literals(["default", "muted", "tint", "brand", "accent", "inverse"]);
export type Surface = typeof Surface.Type;

export const ColorScheme = Schema.Literals(["light", "dark"]);
export type ColorScheme = typeof ColorScheme.Type;

const OklchColor = Schema.String.check(
  Schema.isPattern(/^oklch\(\d+(\.\d+)?%? \d+(\.\d+)? \d+(\.\d+)?( \/ \d+(\.\d+)?%)?\)$/),
);

/** The semantic colors a surface sets, named as shadcn/ui names them. */
export const ColorName = Schema.Literals([
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
]);
export type ColorName = typeof ColorName.Type;

/** The colors one surface re-scopes. */
export const SurfaceColors = Schema.Record(ColorName, OklchColor);
export type SurfaceColors = typeof SurfaceColors.Type;

export const SchemeColors = Schema.Struct({
  default: SurfaceColors,
  muted: SurfaceColors,
  tint: SurfaceColors,
  brand: SurfaceColors,
  accent: SurfaceColors,
  inverse: SurfaceColors,
});
export type SchemeColors = typeof SchemeColors.Type;

/** A pair of a theme's colors that doesn't reach the contrast WCAG 2.2 AA asks for. */
export const ContrastIssue = Schema.Struct({
  scheme: ColorScheme,
  surface: Surface,
  color: ColorName,
  on: ColorName,
  /** What the pair is, for someone choosing a theme. */
  what: Schema.String,
  /** The contrast the pair has, rounded down to two decimals. */
  ratio: Schema.Finite,
  required: Schema.Finite,
});
export type ContrastIssue = typeof ContrastIssue.Type;

/** A color as a person picks it, such as `#1f5c44`. */
export const HexColor = Schema.String.check(
  Schema.isPattern(/^#[0-9a-f]{6}$/, { message: "Use a color such as #1f5c44" }),
);
export type HexColor = typeof HexColor.Type;

/** The hue the theme's grays lean towards. */
export const NeutralTone = Schema.Literals(["cool", "neutral", "warm"]);
export type NeutralTone = typeof NeutralTone.Type;

/** How a theme's cards are set apart from what's behind them. */
export const CardStyle = Schema.Literals(["outline", "filled", "raised"]);
export type CardStyle = typeof CardStyle.Type;

/** The tokens a theme shares between both color schemes, as they're chosen and as pages read them. */
const styleFields = {
  /** Whether pages are always light, always dark, or follow the visitor's setting. */
  colorMode: Schema.Literals(["light", "dark", "system"]),
  fonts: Schema.Struct({ heading: FontId, body: FontId }),
  typeScale: Schema.Literals(["x-small", "small", "medium", "large", "x-large"]),
  headingWeight: Schema.Literals([300, 400, 500, 600, 700, 800]),
  /** Headings set close together, as written, or in widely spaced capitals. */
  headingStyle: Schema.Literals(["tight", "normal", "uppercase"]),
  /** The short lines above headings and on badges. */
  labelStyle: Schema.Literals(["plain", "uppercase", "pill", "mono"]),
  radius: Schema.Literals(["none", "small", "medium", "large"]),
  /** Buttons with the theme's corners, or fully round ends. */
  buttons: Schema.Literals(["rounded", "pill"]),
  cards: CardStyle,
  density: Schema.Literals(["compact", "comfortable", "spacious"]),
  /** How wide a page's content runs on a large screen. */
  width: Schema.Literals(["narrow", "regular", "wide"]),
  imageCorners: Schema.Literals(["square", "rounded", "extra-rounded"]),
  motion: Schema.Boolean,
  /** Thin lines down the content's sides and between sections, like a ruled sheet. */
  lines: Schema.Boolean,
};

/**
 * A brand's theme as its admins set it: a brand color, an optional second
 * color, the tone of its grays, and the rest of its tokens.
 */
const CurrentThemeValues = Schema.Struct({
  brandColor: HexColor,
  accentColor: Schema.NullOr(HexColor),
  neutral: NeutralTone,
  ...styleFields,
});

/*
 * The first theme schema, which brand revisions, drafts and snapshots made
 * before the second still hold. It reads as the second, with the look it
 * always had: its shadow becomes the style of its cards.
 */

const firstStyleFields = {
  fonts: styleFields.fonts,
  typeScale: Schema.Literals(["small", "medium", "large"]),
  headingWeight: Schema.Literals([500, 600, 700, 800]),
  radius: styleFields.radius,
  shadow: Schema.Literals(["flat", "soft", "raised"]),
  density: styleFields.density,
  imageCorners: styleFields.imageCorners,
  motion: Schema.Boolean,
};

type FirstStyle = Schema.Struct.Type<typeof firstStyleFields>;

/** A first-schema theme's style in the current schema, with the look it always had. */
export const upgradeStyle = ({ shadow, ...style }: FirstStyle) => ({
  ...style,
  colorMode: "system" as const,
  headingStyle: "normal" as const,
  labelStyle: "uppercase" as const,
  buttons: "rounded" as const,
  cards: shadow === "flat" ? ("outline" as const) : ("raised" as const),
  width: "regular" as const,
  lines: false,
});

const FirstThemeValues = Schema.Struct({
  brandColor: HexColor,
  neutral: NeutralTone,
  ...firstStyleFields,
});

export const ThemeValues = Schema.Union([
  CurrentThemeValues,
  FirstThemeValues.pipe(
    Schema.decodeTo(CurrentThemeValues, {
      decode: SchemaGetter.transform(({ brandColor, neutral, ...style }) => ({
        brandColor,
        accentColor: null,
        neutral,
        ...upgradeStyle(style),
      })),
      encode: SchemaGetter.forbidden(() => "Themes are written in the current schema"),
    }),
  ),
]);
export type ThemeValues = typeof CurrentThemeValues.Type;

/** A resolved theme in the current schema. `ResolvedTheme` also reads older ones. */
export const CurrentResolvedTheme = Schema.Struct({
  schema: Schema.Literal("pakshi.theme/2"),
  colors: Schema.Struct({ light: SchemeColors, dark: SchemeColors }),
  ...styleFields,
});

const FirstSchemeColors = Schema.Struct({
  default: SurfaceColors,
  muted: SurfaceColors,
  brand: SurfaceColors,
  inverse: SurfaceColors,
});

/** A resolved theme of the first schema, as older revisions, drafts and snapshots hold it. */
export const FirstResolvedTheme = Schema.Struct({
  schema: Schema.Literal("pakshi.theme/1"),
  colors: Schema.Struct({ light: FirstSchemeColors, dark: FirstSchemeColors }),
  ...firstStyleFields,
});
export type FirstResolvedTheme = typeof FirstResolvedTheme.Type;
export type ResolvedTheme = typeof CurrentResolvedTheme.Type;
