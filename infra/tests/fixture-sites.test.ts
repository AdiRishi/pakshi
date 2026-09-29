import { renderPage } from "@repo/blocks";
import { blockFixtures, fixtureTree } from "@repo/blocks/fixtures";
import { expect, test } from "vitest";

import { fixtureSites, fixturesPath } from "../src/fixture-sites.ts";

test("every block fixture is shown on a fixture site", async () => {
  const sites = await fixtureSites();
  const key = (block: {
    readonly type: string;
    readonly variant: string;
    readonly props: object;
  }) => JSON.stringify([block.type, block.variant, block.props]);
  const shown = new Set(
    sites.flatMap(({ manifest, pages }) => [
      ...Object.values(manifest.parts.blocks).map(key),
      ...pages.flatMap(({ page }) => Object.values(page.blocks).map(key)),
    ]),
  );
  for (const entry of blockFixtures)
    expect(shown, `${entry.type} v${entry.version} ${entry.name}`).toContain(
      key(fixtureTree(entry)),
    );
});

test("each fixture site's pages render at its pinned block versions", async () => {
  for (const site of await fixtureSites()) {
    expect(site.pages.map(({ page }) => page.path)).toContain(fixturesPath);
    for (const { page } of site.pages) {
      const rendered = await renderPage(page, site.manifest.parts, site.manifest.lockfile);
      expect(rendered.sections).toHaveLength(page.root.length);
    }
  }
});
