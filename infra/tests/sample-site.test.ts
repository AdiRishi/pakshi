import { renderPage } from "@repo/blocks";
import { expect, test } from "vitest";

import { sampleSite } from "../src/sample-site.ts";

test("the sample snapshot's pages all render at its pinned block versions", async () => {
  const sample = await sampleSite();
  for (const { page } of sample.pages) {
    const rendered = await renderPage(page, sample.manifest.parts, sample.manifest.lockfile);
    expect(rendered.sections).toHaveLength(page.root.length);
  }
});

test("every page link in the sample snapshot points at one of its pages", async () => {
  const sample = await sampleSite();
  const pages = new Set(sample.manifest.pages.map((page) => page.id));
  const linked = [...sample.pages.map(({ json }) => json), sample.manifest.parts].flatMap((json) =>
    Array.from(
      JSON.stringify(json).matchAll(/"\$ref":"page","id":"(pg_[A-Za-z0-9]+)"/g),
      (m) => m[1],
    ),
  );
  expect(linked.length).toBeGreaterThan(0);
  for (const id of linked) expect(pages).toContain(id);
});
