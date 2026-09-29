import { Schema } from "effect";

export const Surface = Schema.Literals(["default", "muted", "brand", "inverse"]);
export type Surface = typeof Surface.Type;

const OklchColor = Schema.String.check(
  Schema.isPattern(/^oklch\(\d+(\.\d+)?%? \d+(\.\d+)? \d+(\.\d+)?( \/ \d+(\.\d+)?%)?\)$/),
);

const colorFields = {
  background: OklchColor,
  foreground: OklchColor,
  card: OklchColor,
  "card-foreground": OklchColor,
  popover: OklchColor,
  "popover-foreground": OklchColor,
  primary: OklchColor,
  "primary-foreground": OklchColor,
  secondary: OklchColor,
  "secondary-foreground": OklchColor,
  muted: OklchColor,
  "muted-foreground": OklchColor,
  accent: OklchColor,
  "accent-foreground": OklchColor,
  destructive: OklchColor,
  border: OklchColor,
  input: OklchColor,
  ring: OklchColor,
};

export const SurfaceColors = Schema.Struct(colorFields);
export type SurfaceColors = typeof SurfaceColors.Type;

const SchemeColors = Schema.Struct({
  default: SurfaceColors,
  muted: SurfaceColors,
  brand: SurfaceColors,
  inverse: SurfaceColors,
});
export type SchemeColors = typeof SchemeColors.Type;

const FontStack = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9 ,'"-]+$/));

export const ResolvedTheme = Schema.Struct({
  schema: Schema.Literal("pakshi.theme/1"),
  colors: Schema.Struct({ light: SchemeColors, dark: SchemeColors }),
  fonts: Schema.Struct({ heading: FontStack, body: FontStack }),
  typeScale: Schema.Literals(["minor-third", "major-third", "perfect-fourth"]),
  headingWeight: Schema.Literals([500, 600, 700, 800]),
  radius: Schema.Literals(["none", "small", "medium", "large"]),
  shadow: Schema.Literals(["flat", "soft", "raised"]),
  density: Schema.Literals(["compact", "comfortable", "spacious"]),
  imageCorners: Schema.Literals(["square", "rounded"]),
  motion: Schema.Boolean,
});
export type ResolvedTheme = typeof ResolvedTheme.Type;
