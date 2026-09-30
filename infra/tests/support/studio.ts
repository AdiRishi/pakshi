import { type Browser, expect, type Page } from "@playwright/test";

export const studioUrl = process.env.STUDIO_URL ?? "";

/** A browser page signed in to Studio as a test user, in a context of its own. */
export const signedIn = async (
  browser: Browser,
  name: string,
  viewport = { width: 1440, height: 900 },
) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(studioUrl);
  await page.getByRole("link", { name: /^Continue with .* account$/ }).click();
  await page.getByRole("button", { name }).click();
  await expect(page.getByRole("heading", { name: `Hello, ${name.split(" ")[0]}` })).toBeVisible();
  return page;
};

/** Starts a draft of what a site serves, from its drafts list, and returns the draft's address in Studio. */
export const newDraft = async (page: Page, site: string, name: string) => {
  await page.goto(`${studioUrl}/sites/${site}`);
  const dialog = page.getByRole("dialog", { name: "New draft" });
  // The page renders on the server, and the button works once it hydrates.
  await expect(async () => {
    await page.getByRole("button", { name: "New draft" }).first().click();
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await dialog.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Start draft" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  return page.url();
};

/** Opens a page of a draft in the editor, and waits for the canvas to show it. */
export const openInEditor = async (page: Page, draftUrl: string, pageId: string) => {
  await page.goto(`${draftUrl}/pages/${pageId}`);
  const canvas = page.frameLocator("iframe[title^='Canvas']");
  await expect(canvas.locator("[data-pakshi-block]").first()).toBeVisible();
  return canvas;
};
