import { expect, type Page, test } from "@playwright/test";

import { fixtureSites, fixturesPath } from "../src/fixture-sites.ts";

/*
 * Every fixture of every block version as sites serves it, against its
 * baseline. A released version's baselines change only with an entry in the
 * rendering changes log naming it, which CI checks, because a change here
 * changes what live sites show without a new version.
 */

const sitesUrl = new URL(process.env.SITES_URL ?? "http://localhost");

const sites = await fixtureSites();

const open = async (page: Page, site: (typeof sites)[number]) => {
  await page.goto(`${sitesUrl.protocol}//${site.host(sitesUrl.host)}${fixturesPath}`);
  await page.evaluate(() =>
    Promise.all(
      Array.from(document.images, (image) => {
        image.loading = "eager";
        return image.decode().catch(() => undefined);
      }),
    ),
  );
};

for (const scheme of ["light", "dark"] as const) {
  test(`every block fixture matches its baseline in ${scheme}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      colorScheme: scheme,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const taken = new Set<string>();
    for (const site of sites) {
      await open(page, site);
      const sections = page.locator("body > main > *");
      for (const [index, { fixture, item }] of site.fixtures.entries()) {
        const name = `${fixture.type}-v${fixture.version}-${fixture.name}-${scheme}`;
        // Each generation's sites share a header or footer fixture; one baseline covers it.
        if (taken.has(name)) continue;
        taken.add(name);
        const part =
          index === 0
            ? page.locator("body > header")
            : index === site.fixtures.length - 1
              ? page.locator("body > footer")
              : sections.nth(index - 1);
        await expect(item ? part.locator("li").first() : part).toHaveScreenshot(`${name}.png`, {
          animations: "disabled",
        });
      }
    }
    await context.close();
  });
}
