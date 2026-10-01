/*
 * Colors in OKLCH, the space palettes are generated in, and their WCAG 2
 * contrast, which is measured in sRGB. Conversions follow Björn Ottosson's
 * OKLab definition.
 */

/** A color as lightness (0 to 1), chroma (0 and up) and hue in degrees. */
export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

type Rgb = readonly [number, number, number];

const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const fromLinear = (channel: number) =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;

const linearToOklch = ([r, g, b]: Rgb): Oklch => {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = (Math.atan2(bb, a) * 180) / Math.PI;
  return { l: lightness, c: Math.hypot(a, bb), h: hue < 0 ? hue + 360 : hue };
};

const oklchToLinear = ({ l: lightness, c, h }: Oklch): Rgb => {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
};

const inGamut = (rgb: Rgb) => rgb.every((channel) => channel >= -1e-4 && channel <= 1 + 1e-4);

/** The color with its chroma reduced until sRGB can show it, keeping lightness and hue. */
export const toGamut = (color: Oklch): Oklch => {
  const l = Math.min(Math.max(color.l, 0), 1);
  if (inGamut(oklchToLinear({ ...color, l }))) return { ...color, l };
  let [low, high] = [0, color.c];
  while (high - low > 1e-4) {
    const middle = (low + high) / 2;
    if (inGamut(oklchToLinear({ l, c: middle, h: color.h }))) low = middle;
    else high = middle;
  }
  return { l, c: low, h: color.h };
};

/** A `#rrggbb` color in OKLCH. */
export const hexToOklch = (hex: string): Oklch => {
  const value = Number.parseInt(hex.slice(1), 16);
  return linearToOklch([
    toLinear(((value >> 16) & 255) / 255),
    toLinear(((value >> 8) & 255) / 255),
    toLinear((value & 255) / 255),
  ]);
};

/** The nearest `#rrggbb` to a color, after bringing it into sRGB's gamut. */
export const oklchToHex = (color: Oklch) =>
  `#${oklchToLinear(toGamut(color))
    .map((channel) =>
      Math.round(Math.min(Math.max(fromLinear(channel), 0), 1) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

const round = (value: number, digits: number) => Number(value.toFixed(digits));

/**
 * A color as the CSS `oklch()` value a theme stores, rounded to what the eye
 * can tell apart. Contrast is measured on the rounded value, which is the one
 * pages show.
 */
export const formatOklch = (color: Oklch) => {
  const { l, c, h } = toGamut(color);
  return `oklch(${round(l, 3)} ${round(c, 3)} ${round(c < 0.0005 ? 0 : h, 1)})`;
};

/** Reads a value `formatOklch` wrote. */
export const parseOklch = (value: string): Oklch => {
  const [l = "0", c = "0", h = "0"] = value.slice("oklch(".length, -1).split(" ");
  const lightness = l.endsWith("%") ? Number.parseFloat(l) / 100 : Number.parseFloat(l);
  return { l: lightness, c: Number.parseFloat(c), h: Number.parseFloat(h) };
};

/** WCAG 2's relative luminance of a color. */
const luminance = (color: Oklch) => {
  const [r, g, b] = oklchToLinear(toGamut(color)).map((channel) =>
    Math.min(Math.max(channel, 0), 1),
  );
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};

/** WCAG 2's contrast ratio between two colors, from 1 to 21. */
export const contrast = (a: Oklch, b: Oklch) => {
  const [lighter, darker] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
};
