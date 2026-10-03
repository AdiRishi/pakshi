import { expect, type Page, test } from "@playwright/test";

import {
  addTextSection,
  browserFor,
  clickWhenReady,
  createBrand,
  createSite,
  describePage,
  newDraft,
  openHome,
  previewOf,
  siteAddress,
  submit,
  unique,
  uniqueAddress,
  visit,
} from "./support/studio.ts";

/**
 * Opens the header's phone menu and closes it with Escape. A click before
 * the page has hydrated does nothing, so it tries until the menu opens.
 */
const useMenu = async (page: Page) => {
  const button = page.getByRole("button", { name: "Menu" });
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(async () => {
    await button.click();
    await expect(menu).toBeVisible({ timeout: 1000 });
  }).toPass();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();
};

test("the header's menu works on the live site and in a draft's preview", async ({ browser }) => {
  const priya = await browserFor(browser, "admin");
  const brand = unique("Harbour Arts");
  const address = uniqueAddress("interactive");
  await createBrand(priya, brand);
  const launch = await createSite(priya, unique("Harbour Arts Centre"), brand, address);
  const site = new URL(launch).pathname.split("/")[2] ?? "";

  const home = await openHome(priya, launch);
  await addTextSection(priya, home, "Harbour Arts Centre", "Classes, studios and shows.");
  await describePage(priya, "Classes, studios and shows at Harbour Arts Centre.");

  await visit(priya, launch);
  const menus = priya.getByRole("region", { name: "Main menu" });
  await clickWhenReady(
    menus.getByRole("button", { name: "Add item" }),
    menus.getByLabel("Links to", { exact: true }),
  );
  await menus.getByLabel("Links to", { exact: true }).selectOption({ index: 1 });
  await menus.getByLabel("Label", { exact: true }).fill("Visit");
  await menus.getByLabel("Label", { exact: true }).blur();
  await expect(menus.getByLabel("Label", { exact: true })).toHaveValue("Visit");
  await submit(priya, "Publish");

  const visitor = await browserFor(browser, "visitor");
  await visitor.setViewportSize({ width: 390, height: 844 });
  const live = siteAddress(address);
  await expect.poll(async () => (await visitor.request.get(live)).status()).toBe(200);
  await visitor.goto(live);
  await useMenu(visitor);

  const draft = await newDraft(priya, site, "Check the menu");
  await priya.setViewportSize({ width: 390, height: 844 });
  await priya.goto(previewOf(site, draft));
  await expect(priya.getByRole("complementary", { name: "Preview" })).toBeVisible();
  await useMenu(priya);
});
