import { Schema } from "effect";
import { expect, test } from "vitest";

import {
  contrast,
  contrastIssues,
  defaultTheme,
  hexToOklch,
  oklchToHex,
  ResolvedTheme,
  resolveTheme,
  scopedThemeVariables,
  themeCss,
  ThemeValues,
} from "../src/index.ts";

const resolved = resolveTheme(defaultTheme).theme;

/** The default theme, following the visitor's color scheme. */
const following = { ...resolved, colorMode: "system" } as const;

/** The declarations of the first CSS rule for `selector`. */
const rule = (css: string, selector: string) => {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf("}", start));
};

test("contrast follows WCAG 2's formula", () => {
  expect(contrast(hexToOklch("#000000"), hexToOklch("#ffffff"))).toBeCloseTo(21, 1);
  // WCAG's own example: #767676 is the lightest gray that reads on white.
  expect(contrast(hexToOklch("#767676"), hexToOklch("#ffffff"))).toBeCloseTo(4.54, 2);
  expect(contrast(hexToOklch("#777777"), hexToOklch("#ffffff"))).toBeLessThan(4.5);
});

test("the default theme reads clearly in light and dark", () => {
  const { theme, issues } = resolveTheme(defaultTheme);
  expect(issues).toEqual([]);
  expect(Schema.decodeSync(ResolvedTheme)(theme)).toEqual(theme);
});

test("text stays readable whatever the brand color, except the brand color itself on light pages", () => {
  for (const hue of [0, 40, 90, 140, 200, 260, 320])
    for (const lightness of [0.2, 0.45, 0.7, 0.9]) {
      const brandColor = oklchToHex({ l: lightness, c: 0.15, h: hue });
      for (const neutral of ["cool", "neutral", "warm"] as const) {
        const { issues } = resolveTheme({ ...defaultTheme, brandColor, neutral });
        for (const issue of issues) {
          expect(issue.scheme).toBe("light");
          expect(["default", "muted"]).toContain(issue.surface);
          expect(["primary", "ring"]).toContain(issue.color);
        }
      }
    }
});

test("a brand color too light to read on a light page is reported, with its contrast", () => {
  const { issues } = resolveTheme({ ...defaultTheme, brandColor: "#ffe14d" });
  expect(issues).toContainEqual(
    expect.objectContaining({
      scheme: "light",
      surface: "default",
      color: "primary",
      on: "background",
      what: "Links and outlined buttons",
      required: 4.5,
    }),
  );
  for (const issue of issues) expect(issue.ratio).toBeLessThan(issue.required);
});

test("theme values that could escape their CSS declaration are rejected", () => {
  for (const theme of [
    { ...resolved, fonts: { ...resolved.fonts, heading: "serif; } body { display: none" } },
    {
      ...resolved,
      colors: {
        ...resolved.colors,
        light: {
          ...resolved.colors.light,
          brand: { ...resolved.colors.light.brand, primary: "red; background: url(x)" },
        },
      },
    },
  ]) {
    expect(Schema.is(ResolvedTheme)(theme)).toBe(false);
  }
});

test("dark colors apply only when the visitor prefers a dark scheme", () => {
  const light = resolved.colors.light.default.background;
  const dark = resolved.colors.dark.default.background;
  const [beforeQuery, insideQuery] = themeCss(following).split(
    "@media (prefers-color-scheme: dark)",
  );
  expect(beforeQuery).toContain(`--background: ${light};`);
  expect(beforeQuery).not.toContain(`--background: ${dark};`);
  expect(insideQuery).toContain(`--background: ${dark};`);
  expect(insideQuery).toContain("color-scheme: dark;");
});

test("a fixed scheme applies its colors whatever the visitor prefers", () => {
  const css = themeCss(following, "dark");
  expect(css).not.toContain("prefers-color-scheme");
  expect(css).toContain(`--background: ${resolved.colors.dark.default.background};`);
  expect(css).not.toContain(`--background: ${resolved.colors.light.default.background};`);
});

test("a theme set to always be dark shows its dark colors, whatever scheme is asked for", () => {
  const dark = { ...resolved, colorMode: "dark" } as const;
  for (const css of [themeCss(dark), themeCss(dark, "light")]) {
    expect(css).not.toContain("prefers-color-scheme");
    expect(css).toContain(`--background: ${resolved.colors.dark.default.background};`);
    expect(css).not.toContain(`--background: ${resolved.colors.light.default.background};`);
  }
});

test("each surface re-scopes the semantic colors for its section", () => {
  expect(rule(themeCss(resolved, "light"), '[data-surface="brand"]')).toContain(
    `--background: ${resolved.colors.light.brand.background};`,
  );
});

test("a brand's logo for dark backgrounds shows only on dark surfaces", () => {
  const light = themeCss(resolved, "light");
  expect(rule(light, '[data-surface="default"]')).toContain("--theme-on-dark: none;");
  expect(rule(light, '[data-surface="inverse"]')).toContain("--theme-on-dark: inline-block;");
  expect(rule(light, '[data-surface="inverse"]')).toContain("--theme-on-light: none;");
  expect(rule(themeCss(following, "dark"), '[data-surface="default"]')).toContain(
    "--theme-on-dark: inline-block;",
  );
});

test("a scoped theme sets its colors only inside its scope, surfaces included", () => {
  const css = scopedThemeVariables(following, "dark", '[data-brand="a"]');
  expect(css).not.toContain(":root");
  expect(css).not.toMatch(/^\[data-surface/m);
  expect(rule(css, '[data-brand="a"]')).toContain("--theme-font-heading: 'Literata',");
  expect(rule(css, '[data-brand="a"] [data-surface="brand"]')).toContain(
    `--background: ${resolved.colors.dark.brand.background};`,
  );
});

test("pages load the theme's two fonts from the site itself", () => {
  const css = themeCss({ ...resolved, fonts: { heading: "fraunces", body: "onest" } });
  const sources = Array.from(css.matchAll(/src: url\(([^)]+)\)/g), (match) => match[1]);
  expect(sources.length).toBeGreaterThan(0);
  for (const source of sources) expect(source).toMatch(/^\/_fonts\/(fraunces|onest)-/);
  expect(css).toContain("font-family: 'Fraunces';");
  expect(css).toContain("--theme-font-body: 'Onest',");
});

test("a theme saved in the first schema reads in the current one, looking as it did", () => {
  const first = {
    brandColor: "#1f5c44",
    neutral: "cool",
    fonts: { heading: "fraunces", body: "onest" },
    typeScale: "large",
    headingWeight: 700,
    radius: "medium",
    shadow: "flat",
    density: "spacious",
    imageCorners: "square",
    motion: false,
  };
  expect(Schema.decodeUnknownSync(ThemeValues)(first)).toEqual({
    brandColor: "#1f5c44",
    accentColor: null,
    neutral: "cool",
    colorMode: "system",
    fonts: { heading: "fraunces", body: "onest" },
    typeScale: "large",
    headingWeight: 700,
    headingStyle: "normal",
    labelStyle: "uppercase",
    radius: "medium",
    buttons: "rounded",
    cards: "outline",
    density: "spacious",
    width: "regular",
    imageCorners: "square",
    motion: false,
    lines: false,
  });
});

test("a resolved theme of the first schema keeps its colors and gains the new surfaces", () => {
  const { tint: _, accent: __, ...light } = resolved.colors.light;
  const { tint: ___, accent: ____, ...dark } = resolved.colors.dark;
  const first = {
    schema: "pakshi.theme/1",
    colors: { light, dark },
    fonts: resolved.fonts,
    typeScale: "medium",
    headingWeight: 600,
    radius: "small",
    shadow: "soft",
    density: "comfortable",
    imageCorners: "rounded",
    motion: true,
  };
  const upgraded = Schema.decodeUnknownSync(ResolvedTheme)(first);
  expect(upgraded.schema).toBe("pakshi.theme/2");
  expect(upgraded.colors.light.default).toEqual(light.default);
  expect(upgraded.colors.dark.brand).toEqual(dark.brand);
  expect(upgraded.colors.light.tint.primary).toBe(resolved.colors.light.tint.primary);
  expect(upgraded.cards).toBe("raised");
  expect(contrastIssues(upgraded.colors)).toEqual([]);
  expect(Schema.encodeSync(ResolvedTheme)(upgraded)).toEqual(upgraded);
});
