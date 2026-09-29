import { Schema } from "effect";
import { expect, test } from "vitest";

import { harbour, ResolvedTheme, themeCss } from "../src/index.ts";

test("the preset is a valid resolved theme", () => {
  expect(Schema.decodeSync(ResolvedTheme)(harbour)).toEqual(harbour);
});

test("theme values that could escape their CSS declaration are rejected", () => {
  for (const theme of [
    { ...harbour, fonts: { ...harbour.fonts, heading: "serif; } body { display: none" } },
    {
      ...harbour,
      colors: {
        ...harbour.colors,
        light: {
          ...harbour.colors.light,
          brand: { ...harbour.colors.light.brand, primary: "red; background: url(x)" },
        },
      },
    },
  ]) {
    expect(Schema.is(ResolvedTheme)(theme)).toBe(false);
  }
});

test("dark colors apply only when the visitor prefers a dark scheme", () => {
  const css = themeCss(harbour);
  const [light, dark] = css.split("@media (prefers-color-scheme: dark)");
  expect(light).toContain("--background: oklch(0.99 0.004 85);");
  expect(light).not.toContain("--background: oklch(0.19 0.02 250);");
  expect(dark).toContain("--background: oklch(0.19 0.02 250);");
  expect(dark).toContain("color-scheme: dark;");
});

test("each surface re-scopes the semantic colors for its section", () => {
  const css = themeCss(harbour);
  expect(css).toMatch(/\[data-surface="brand"\] \{[^}]*--background: oklch\(0\.4 0\.12 252\);/);
  expect(css).toMatch(/\[data-surface="inverse"\] \{[^}]*--foreground: oklch\(0\.97 0\.006 85\);/);
});
