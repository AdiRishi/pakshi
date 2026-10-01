import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { resolveTheme } from "@repo/tokens";

import { liveHome, previewOf, signedIn, studioUrl } from "./support/studio.ts";

const wcag = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

/** The light scheme's primary color for a brand color, as a page's theme CSS declares it. */
const primaryDeclaration = (brandColor: `#${string}`) =>
  `--primary: ${resolveTheme({ preset: "editorial", changes: { brandColor } }).theme.colors.light.default.primary};`;

test("a brand's new color reaches its sites as Brand update drafts, not their live pages", async ({
  browser,
}) => {
  const meera = await signedIn(browser, "Meera Kapoor");
  await meera.goto(`${studioUrl}/brands/brand_harbour`);
  const color = meera.getByLabel("Brand color", { exact: true });
  const save = meera.getByRole("button", { name: "Save theme" });
  // A color the brand doesn't have yet, so the suite can run again on one stack.
  const saved = await meera.getByLabel("Pick the brand color").inputValue();
  const brandColor = saved === "#7a1f5c" ? "#1f5c44" : "#7a1f5c";
  // The page renders on the server, and the field works once it hydrates.
  await expect(async () => {
    // Clearing first makes each try a change, whether or not the page had hydrated before.
    await color.fill("");
    await color.fill("#ffe14d");
    await expect(meera.getByText("Some text is too hard to read")).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(save).toBeDisabled();
  const results = await new AxeBuilder({ page: meera })
    .withTags(wcag)
    .exclude("iframe[title^='Preview of']")
    .analyze();
  expect(results.violations).toEqual([]);

  await color.fill(brandColor);
  await expect(meera.getByText("Text passes WCAG AA in light and dark")).toBeVisible();
  await save.click();
  await expect(meera.getByText("Theme saved")).toBeVisible();

  await meera.goto(`${studioUrl}/sites/site_harbour`);
  const update = meera.getByRole("link", { name: "Brand update" });
  await expect(update).toBeVisible();
  await update.click();
  await expect(meera.getByRole("heading", { name: "Brand update", level: 1 })).toBeVisible();

  // The draft's preview has the new color; the live site keeps its own until the draft publishes.
  const preview = await meera.request.get(previewOf("site_harbour", meera.url()));
  expect(await preview.text()).toContain(primaryDeclaration(brandColor));
  expect(await liveHome(meera)).not.toContain(primaryDeclaration(brandColor));
});

test("adopting a block's newer version makes a draft with it, leaving the live site alone", async ({
  browser,
}) => {
  const meera = await signedIn(browser, "Meera Kapoor");
  await meera.goto(`${studioUrl}/sites/site_harbour/blocks`);
  const banner = meera.getByRole("alert").filter({ hasText: "Header v2 is available" });
  await expect(banner).toBeVisible();
  // The page renders on the server, and the button works once it hydrates. Adopting opens the
  // draft; when an earlier run adopted it already, the banner links to that draft instead.
  await expect(async () => {
    if (!meera.url().includes("/drafts/"))
      await banner
        .getByRole("button", { name: "Adopt Header v2" })
        .or(banner.getByRole("link", { name: "Open draft" }))
        .click({ timeout: 1000 });
    await expect(meera).toHaveURL(/\/drafts\//, { timeout: 3000 });
  }).toPass();
  await expect(meera.getByRole("heading", { name: "Header v2 upgrade", level: 1 })).toBeVisible();

  // Header v2 shows the brand's logo where v1 showed the site's name.
  const preview = await (await meera.request.get(previewOf("site_harbour", meera.url()))).text();
  expect(preview).toMatch(/<header[^>]*>.*<img[^>]*alt="Harbour Summer School"/s);
  expect(await liveHome(meera)).not.toMatch(/<header[^>]*>.*<img[^>]*alt="Harbour Summer School"/s);
});
