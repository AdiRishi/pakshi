import { Schema } from "effect";
import { expect, test } from "vitest";

import { Link } from "../src/references.ts";

test("links accept pages on the site and safe external protocols", () => {
  for (const link of [
    { $ref: "page", id: "pg_about" },
    "https://example.org/events",
    "http://example.org",
    "mailto:hello@example.org",
    "tel:+6491234567",
  ]) {
    expect(Schema.is(Link)(link)).toBe(true);
  }
});

test("links reject scripts, data and relative addresses", () => {
  for (const link of ["javascript:alert(1)", "data:text/html,hi", "/about", "example.org"]) {
    expect(Schema.is(Link)(link)).toBe(false);
  }
});
