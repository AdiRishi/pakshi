/*
 * Which Tailwind classes bypass a site's theme, for the lint rule that keeps
 * them out of blocks. Blocks style themselves only through the utilities
 * tailwind.css maps to theme variables, so a theme change restyles every
 * block. Tailwind's spacing scale is itself a token here: --spacing comes from
 * the theme's density.
 */

const colorUtilities = [
  "bg",
  "text",
  "border",
  "border-x",
  "border-y",
  "border-t",
  "border-r",
  "border-b",
  "border-l",
  "outline",
  "ring",
  "ring-offset",
  "fill",
  "stroke",
  "from",
  "via",
  "to",
  "shadow",
  "decoration",
  "accent",
  "caret",
  "divide",
  "placeholder",
];

const fontUtilities = ["font", "text", "leading", "tracking"];

const spacingUtilities = [
  "p",
  "px",
  "py",
  "pt",
  "pr",
  "pb",
  "pl",
  "ps",
  "pe",
  "m",
  "mx",
  "my",
  "mt",
  "mr",
  "mb",
  "ml",
  "ms",
  "me",
  "gap",
  "gap-x",
  "gap-y",
  "space-x",
  "space-y",
  "inset",
  "inset-x",
  "inset-y",
  "top",
  "right",
  "bottom",
  "left",
  "w",
  "h",
  "min-w",
  "min-h",
  "max-w",
  "max-h",
  "size",
  "translate-x",
  "translate-y",
  "rounded",
];

const paletteColors = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
];

const escape = (words: ReadonlyArray<string>) =>
  words.toSorted((a, b) => b.length - a.length).join("|");

const arbitrary = new RegExp(
  `^(${escape([...new Set([...colorUtilities, ...fontUtilities, ...spacingUtilities])])})-\\[`,
);
const palette = new RegExp(
  `^(${escape(colorUtilities)})-((${escape(paletteColors)})-\\d+|black|white)(\\/.*)?$`,
);
const fontFamily = /^font-(sans|serif|mono)$/;

/** The utility a class applies, without its variants, important mark or negative sign. */
const utilityOf = (className: string) => {
  let depth = 0;
  let start = 0;
  for (const [index, character] of Array.from(className).entries()) {
    if (character === "[") depth += 1;
    else if (character === "]") depth -= 1;
    else if (character === ":" && depth === 0) start = index + 1;
  }
  return className.slice(start).replace(/^!/, "").replace(/!$/, "").replace(/^-/, "");
};

/** Why a class bypasses the theme, or undefined when it uses the theme's tokens. */
export const literalStyle = (className: string) => {
  const utility = utilityOf(className);
  if (arbitrary.test(utility)) return `${className} sets a literal value; use the theme's tokens`;
  if (palette.test(utility)) return `${className} uses Tailwind's palette; use the theme's colors`;
  if (fontFamily.test(utility))
    return `${className} sets a font family; use font-heading or font-body`;
  return undefined;
};
