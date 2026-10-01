import { Schema } from "effect";
import { expect, test } from "vitest";

import {
  type BrandTheme,
  contrast,
  hexToOklch,
  oklchToHex,
  PresetId,
  presets,
  ResolvedTheme,
  resolveTheme,
  themeCss,
  themeValues,
} from "../src/index.ts";

const editorial = resolveTheme({ preset: "editorial", changes: {} }).theme;

test("contrast follows WCAG 2's formula", () => {
  expect(contrast(hexToOklch("#000000"), hexToOklch("#ffffff"))).toBeCloseTo(21, 1);
  // WCAG's own example: #767676 is the lightest gray that reads on white.
  expect(contrast(hexToOklch("#767676"), hexToOklch("#ffffff"))).toBeCloseTo(4.54, 2);
  expect(contrast(hexToOklch("#777777"), hexToOklch("#ffffff"))).toBeLessThan(4.5);
});

test("every preset reads clearly in light and dark", () => {
  for (const preset of PresetId.literals) {
    const { theme, issues } = resolveTheme({ preset, changes: {} });
    expect(issues).toEqual([]);
    expect(Schema.decodeSync(ResolvedTheme)(theme)).toEqual(theme);
  }
});

test("text stays readable whatever the brand color, except the brand color itself on light pages", () => {
  for (const hue of [0, 40, 90, 140, 200, 260, 320])
    for (const lightness of [0.2, 0.45, 0.7, 0.9]) {
      const brandColor = oklchToHex({ l: lightness, c: 0.15, h: hue });
      for (const neutral of ["cool", "neutral", "warm"] as const) {
        const { issues } = resolveTheme({
          preset: "editorial",
          changes: { brandColor, neutral },
        });
        for (const issue of issues) {
          expect(issue.scheme).toBe("light");
          expect(["default", "muted"]).toContain(issue.surface);
          expect(["primary", "ring"]).toContain(issue.color);
        }
      }
    }
});

test("a brand color too light to read on a light page is reported, with its contrast", () => {
  const { issues } = resolveTheme({ preset: "civic", changes: { brandColor: "#ffe14d" } });
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

test("a brand's changes stay when it picks another preset", () => {
  const theme: BrandTheme = {
    preset: "civic",
    changes: { brandColor: "#7a1f5c", fonts: { heading: "fraunces", body: "onest" } },
  };
  const moved = themeValues({ ...theme, preset: "bold" });
  expect(moved.brandColor).toBe("#7a1f5c");
  expect(moved.fonts).toEqual({ heading: "fraunces", body: "onest" });
  expect(moved.density).toBe(presets.bold.density);
});

test("theme values that could escape their CSS declaration are rejected", () => {
  for (const theme of [
    { ...editorial, fonts: { ...editorial.fonts, heading: "serif; } body { display: none" } },
    {
      ...editorial,
      colors: {
        ...editorial.colors,
        light: {
          ...editorial.colors.light,
          brand: { ...editorial.colors.light.brand, primary: "red; background: url(x)" },
        },
      },
    },
  ]) {
    expect(Schema.is(ResolvedTheme)(theme)).toBe(false);
  }
});

test("dark colors apply only when the visitor prefers a dark scheme", () => {
  const light = editorial.colors.light.default.background;
  const dark = editorial.colors.dark.default.background;
  const [beforeQuery, insideQuery] = themeCss(editorial).split(
    "@media (prefers-color-scheme: dark)",
  );
  expect(beforeQuery).toContain(`--background: ${light};`);
  expect(beforeQuery).not.toContain(`--background: ${dark};`);
  expect(insideQuery).toContain(`--background: ${dark};`);
  expect(insideQuery).toContain("color-scheme: dark;");
});

test("a fixed scheme applies its colors whatever the visitor prefers", () => {
  const css = themeCss(editorial, "dark");
  expect(css).not.toContain("prefers-color-scheme");
  expect(css).toContain(`--background: ${editorial.colors.dark.default.background};`);
  expect(css).not.toContain(`--background: ${editorial.colors.light.default.background};`);
});

test("each surface re-scopes the semantic colors for its section", () => {
  const css = themeCss(editorial, "light");
  const brand = css.slice(css.indexOf('[data-surface="brand"]'));
  expect(brand.slice(0, brand.indexOf("}"))).toContain(
    `--background: ${editorial.colors.light.brand.background};`,
  );
});

test("pages load the theme's two fonts from the site itself", () => {
  const css = themeCss({ ...editorial, fonts: { heading: "fraunces", body: "onest" } });
  const sources = Array.from(css.matchAll(/src: url\(([^)]+)\)/g), (match) => match[1]);
  expect(sources.length).toBeGreaterThan(0);
  for (const source of sources) expect(source).toMatch(/^\/_fonts\/(fraunces|onest)-/);
  expect(css).toContain("font-family: 'Fraunces';");
  expect(css).toContain("--theme-font-body: 'Onest',");
});
