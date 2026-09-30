import { type Browser, expect, type FrameLocator, type Page } from "@playwright/test";

export const studioUrl = process.env.STUDIO_URL ?? "";
export const sitesUrl = process.env.SITES_URL ?? "";

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

/** Shows the editor's outline, in the tab beside the chat with Pakshi. */
export const showOutline = (page: Page) => page.getByRole("tab", { name: "Outline" }).click();

/** A block's heading as the editor canvas shows it. */
export const heading = (canvas: FrameLocator, block: string) =>
  canvas.locator(`[data-pakshi-block="${block}"] [data-pakshi-field="heading"]`);

/** Adds text to the end of a block's heading, and waits for the draft to have it. */
export const appendToHeading = async (
  page: Page,
  canvas: FrameLocator,
  block: string,
  text: string,
) => {
  const field = heading(canvas, block);
  await field.evaluate((element) => {
    element.focus();
    const selection = element.ownerDocument.getSelection();
    selection?.selectAllChildren(element);
    selection?.collapseToEnd();
  });
  await page.keyboard.type(text);
  await page.getByRole("button", { name: "Page settings" }).click();
  await expect(page.getByText("Saved to the draft")).toBeVisible();
};

/** The live home page's HTML, fetched past any cache in between. */
export const liveHome = async (page: Page) =>
  (await page.request.get(sitesUrl, { headers: { "cache-control": "no-cache" } })).text();

/** The draft ID at the end of a draft's address in Studio. */
export const draftIdOf = (draftUrl: string) => new URL(draftUrl).pathname.split("/").at(-1) ?? "";

/** A draft's preview address, which Studio serves to anyone the draft is shared with. */
export const previewOf = (site: string, draftUrl: string) =>
  `${studioUrl}/preview/${site}/${draftIdOf(draftUrl)}/`;
