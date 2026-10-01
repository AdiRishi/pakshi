import { Schema } from "effect";

/*
 * The fonts a theme can choose from. Each is a variable font from its
 * Fontsource package, served from the site's own `/_fonts/` path, so no font
 * request leaves the site. A theme names fonts by ID, so a font stays in this
 * list for as long as any snapshot might use it.
 */

interface FontSpec {
  /** The family name pages declare it as. */
  readonly family: string;
  readonly category: "serif" | "sans-serif";
  /** The lightest and heaviest weights the variable font covers. */
  readonly weights: readonly [number, number];
  readonly italic: boolean;
}

export const FontId = Schema.Literals([
  "bricolage-grotesque",
  "fraunces",
  "literata",
  "onest",
  "source-sans-3",
  "source-serif-4",
  "work-sans",
]);
export type FontId = typeof FontId.Type;

export const fontCatalog = {
  "bricolage-grotesque": {
    family: "Bricolage Grotesque",
    category: "sans-serif",
    weights: [200, 800],
    italic: false,
  },
  fraunces: { family: "Fraunces", category: "serif", weights: [100, 900], italic: true },
  literata: { family: "Literata", category: "serif", weights: [200, 900], italic: true },
  onest: { family: "Onest", category: "sans-serif", weights: [100, 900], italic: false },
  "source-sans-3": {
    family: "Source Sans 3",
    category: "sans-serif",
    weights: [200, 900],
    italic: true,
  },
  "source-serif-4": {
    family: "Source Serif 4",
    category: "serif",
    weights: [200, 900],
    italic: true,
  },
  "work-sans": { family: "Work Sans", category: "sans-serif", weights: [100, 900], italic: true },
} as const satisfies Record<FontId, FontSpec>;

/** The URL path every app serves font files under. */
export const fontPath = "/_fonts/";

const subsetNames = ["latin", "latin-ext"] as const;

/** The character ranges pages load, as Google Fonts splits them. */
const subsets = {
  latin:
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  "latin-ext":
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
} as const satisfies Record<(typeof subsetNames)[number], string>;

/** One file of a font: a subset in one style. */
export interface FontFile {
  readonly font: FontId;
  readonly style: "normal" | "italic";
  readonly subset: (typeof subsetNames)[number];
  /** The file's name in its Fontsource package's `files/` folder, and under `fontPath`. */
  readonly name: string;
}

/** Every file a font is served as. */
export const fontFiles = (font: FontId): ReadonlyArray<FontFile> => {
  const styles = fontCatalog[font].italic ? (["normal", "italic"] as const) : (["normal"] as const);
  return styles.flatMap((style) =>
    subsetNames.map((subset) => ({
      font,
      style,
      subset,
      name: `${font}-${subset}-wght-${style}.woff2`,
    })),
  );
};

/** Every font file any theme can load. */
export const allFontFiles = () => FontId.literals.flatMap(fontFiles);

const fallbacks = {
  serif: "Georgia, 'Times New Roman', serif",
  "sans-serif": "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
} as const satisfies Record<FontSpec["category"], string>;

/** The `font-family` value for a font, with fallbacks of its kind while it loads. */
export const fontStack = (font: FontId) => {
  const spec = fontCatalog[font];
  return `'${spec.family}', ${fallbacks[spec.category]}`;
};

/** The `@font-face` rules that load a font from `fontPath`. */
export const fontFaces = (font: FontId) => {
  const spec = fontCatalog[font];
  return fontFiles(font)
    .map((file) =>
      [
        "@font-face {",
        `  font-family: '${spec.family}';`,
        `  font-style: ${file.style};`,
        "  font-display: swap;",
        `  font-weight: ${spec.weights[0]} ${spec.weights[1]};`,
        `  src: url(${fontPath}${file.name}) format('woff2-variations');`,
        `  unicode-range: ${subsets[file.subset]};`,
        "}",
      ].join("\n"),
    )
    .join("\n");
};
