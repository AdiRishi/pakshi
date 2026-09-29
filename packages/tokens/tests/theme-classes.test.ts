import { expect, test } from "vitest";

import { literalStyle } from "../src/theme-classes.ts";

test("classes that bypass the theme are caught, whatever their variants", () => {
  const caught = [
    "bg-[#fff]",
    "text-[13px]",
    "md:p-[3px]",
    "-mt-[2px]",
    "hover:bg-blue-500",
    "text-white",
    "border-slate-200/50",
    "font-serif",
    "[&_a]:text-red-600",
  ];
  expect(caught.filter((name) => literalStyle(name) === undefined)).toEqual([]);
});

test("theme tokens, the theme's spacing scale and layout utilities pass", () => {
  const passing = [
    "bg-primary",
    "text-primary-foreground",
    "py-section",
    "gap-6",
    "max-w-6xl",
    "rounded-image",
    "font-heading",
    "text-title",
    "aspect-[4/3]",
    "[&_p+p]:mt-4",
    "md:grid-cols-2",
  ];
  expect(passing.filter((name) => literalStyle(name) !== undefined)).toEqual([]);
});
