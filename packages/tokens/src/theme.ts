import { Schema } from "effect";

import { FontId } from "./fonts.ts";

export const Surface = Schema.Literals(["default", "muted", "brand", "inverse"]);
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
  brand: SurfaceColors,
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

/** The tokens a theme shares between both color schemes, as they're chosen and as pages read them. */
const styleFields = {
  fonts: Schema.Struct({ heading: FontId, body: FontId }),
  typeScale: Schema.Literals(["small", "medium", "large"]),
  headingWeight: Schema.Literals([500, 600, 700, 800]),
  radius: Schema.Literals(["none", "small", "medium", "large"]),
  shadow: Schema.Literals(["flat", "soft", "raised"]),
  density: Schema.Literals(["compact", "comfortable", "spacious"]),
  imageCorners: Schema.Literals(["square", "rounded", "extra-rounded"]),
  motion: Schema.Boolean,
};

/**
 * A brand's theme as its admins set it: one brand color, the tone of its
 * grays, and the rest of its tokens.
 */
export const ThemeValues = Schema.Struct({
  brandColor: HexColor,
  neutral: NeutralTone,
  ...styleFields,
});
export type ThemeValues = typeof ThemeValues.Type;

/**
 * A theme with its palette generated: what snapshots carry and pages render
 * with. Every value is one `themeCss` can write into a declaration.
 */
export const ResolvedTheme = Schema.Struct({
  schema: Schema.Literal("pakshi.theme/1"),
  colors: Schema.Struct({ light: SchemeColors, dark: SchemeColors }),
  ...styleFields,
});
export type ResolvedTheme = typeof ResolvedTheme.Type;
