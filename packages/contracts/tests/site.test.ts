import { Schema } from "effect";
import { expect, test } from "vitest";

import { SiteParts } from "../src/site.ts";

const header = { type: "header", variant: "standard", surface: "default", props: {} };
const footer = { type: "footer", variant: "simple", surface: "muted", props: {} };
const menus = { main: [], footer: [] };

test("site parts hold exactly one header and one footer block", () => {
  const valid = {
    header: "b_header",
    footer: "b_footer",
    blocks: { b_header: header, b_footer: footer },
    menus,
  };
  expect(Schema.is(SiteParts)(valid)).toBe(true);
  expect(Schema.is(SiteParts)({ ...valid, blocks: { b_header: header } })).toBe(false);
  expect(Schema.is(SiteParts)({ ...valid, blocks: { ...valid.blocks, b_extra: header } })).toBe(
    false,
  );
  expect(Schema.is(SiteParts)({ ...valid, footer: "b_header" })).toBe(false);
});

test("the header and footer need a surface", () => {
  const { surface: _, ...plain } = footer;
  expect(
    Schema.is(SiteParts)({
      header: "b_header",
      footer: "b_footer",
      blocks: { b_header: header, b_footer: plain },
      menus,
    }),
  ).toBe(false);
});
