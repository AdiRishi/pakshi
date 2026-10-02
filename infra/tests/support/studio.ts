import { join } from "node:path";

import { type Browser, expect, type FrameLocator, type Locator, type Page } from "@playwright/test";

export const studioUrl = process.env.STUDIO_URL ?? "";
export const sitesUrl = process.env.SITES_URL ?? "";

/** The organization's first admin, who the setup project signs up through Studio. */
export const admin = {
  organization: "Riverton Council",
  name: "Priya Shah",
  email: "priya@riverton.test",
  password: "priya-password",
};

/** Where the setup project keeps the admin's signed-in browser state for the journeys. */
export const adminState = join(import.meta.dirname, "../../.playwright/admin.json");

const run = Date.now().toString(36);

/** A name unique to this run, since every journey shares one stack. */
export const unique = (name: string) => `${name} ${run}`;

/** A platform subdomain unique to this run. */
export const uniqueAddress = (name: string) => `${name}-${run}`;

/** A site's address on the Sites Worker, at its platform subdomain. */
export const siteAddress = (address: string) => {
  const sites = new URL(sitesUrl);
  return `${sites.protocol}//${address}.${sites.host}`;
};

/** Where a site's own domain answers, on the Sites Worker's port. */
export const domainAddress = (hostname: string) => {
  const sites = new URL(sitesUrl);
  return `${sites.protocol}//${hostname}${sites.port === "" ? "" : `:${sites.port}`}`;
};

/**
 * Connects a domain to a site from its settings. Only names under
 * .localhost can be proven in a local stack, and they are at the first check.
 */
export const connectDomain = async (page: Page, site: string, hostname: string) => {
  await visit(page, `${studioUrl}/sites/${site}/settings/domains`);
  const dialog = page.getByRole("dialog", { name: "Add a domain" });
  await clickWhenReady(page.getByRole("button", { name: "Add domain" }), dialog);
  await dialog.getByLabel("Domain", { exact: true }).fill(hostname);
  await dialog.getByRole("button", { name: "Add domain" }).click();
  await expect(page.getByRole("heading", { name: `Finish connecting ${hostname}` })).toBeVisible();
  await page.getByRole("button", { name: "Check now" }).click();
  await expect(page.getByText(`${hostname} is connected`)).toBeVisible();
};

/** A browser of its own for someone, signed in as the admin or as nobody yet. */
export const browserFor = async (browser: Browser, as: "admin" | "visitor") => {
  const viewport = { width: 1440, height: 1000 };
  const context = await browser.newContext(
    as === "admin" ? { viewport, storageState: adminState } : { viewport },
  );
  return context.newPage();
};

/**
 * Opens a Studio address and waits until React has hydrated the page: it
 * renders on the server first, and its controls respond only after that.
 */
export const visit = async (page: Page, url: string) => {
  await page.goto(url);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
};

/** Clicks something and waits for what it opens. */
export const clickWhenReady = async (button: Locator, appears: Locator) => {
  await button.click();
  await expect(appears).toBeVisible();
};

/** Makes a brand from the Brands screen, and returns its name. */
export const createBrand = async (page: Page, name: string) => {
  await visit(page, `${studioUrl}/brands`);
  const dialog = page.getByRole("dialog", { name: "New brand" });
  await clickWhenReady(page.getByRole("button", { name: "New brand" }), dialog);
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Create brand" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
};

/** Makes a site in a brand, at a platform subdomain, and returns its first draft's address in Studio. */
export const createSite = async (page: Page, name: string, brand: string, address: string) => {
  await visit(page, `${studioUrl}/sites/new`);
  await page.getByLabel("Site name", { exact: true }).fill(name);
  await page.getByLabel("Brand", { exact: true }).selectOption({ label: brand });
  await page.getByLabel("Pakshi address", { exact: true }).fill(address);
  await page.getByRole("button", { name: "Create site" }).click();
  await expect(page.getByRole("heading", { name: "Launch", level: 1 })).toBeVisible();
  return page.url();
};

/**
 * Invites someone from the People screen with a role on a site, and returns
 * the link the invitation sends them.
 */
export const invite = async (page: Page, email: string, site: string, role: string) => {
  await visit(page, `${studioUrl}/people`);
  const dialog = page.getByRole("dialog", { name: "Invite someone" });
  await clickWhenReady(page.getByRole("button", { name: "Invite someone" }), dialog);
  await dialog.getByLabel("Email", { exact: true }).fill(email);
  await dialog.getByLabel("Where", { exact: true }).selectOption({ label: `${site} only` });
  await dialog.getByLabel("Role", { exact: true }).selectOption({ label: role });
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  const link = await page.getByLabel("Invitation link", { exact: true }).inputValue();
  await page.getByRole("button", { name: "Done" }).click();
  return link;
};

/** Someone opens their invitation in a browser of their own and makes their account. */
export const joinFrom = async (browser: Browser, link: string, name: string) => {
  const page = await browserFor(browser, "visitor");
  await visit(page, link);
  await page.getByLabel("Your name", { exact: true }).fill(name);
  await page.getByLabel("Password", { exact: true }).fill(`${name} password`);
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByRole("heading", { name: `Hello, ${name.split(" ")[0]}` })).toBeVisible();
  return page;
};

/** Opens a draft's home page in the editor, and waits for the canvas to show it. */
export const openHome = async (page: Page, draftUrl: string) => {
  await visit(page, draftUrl);
  await page.getByRole("link", { name: "Edit" }).first().click();
  const canvas = page.frameLocator("iframe[title^='Canvas']");
  await expect(canvas.locator("[data-pakshi-block]").first()).toBeVisible();
  return canvas;
};

/** Replaces the text of a field on the canvas, as someone selecting it all and typing does. */
export const typeInto = async (page: Page, field: Locator, text: string) => {
  await field.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text);
};

/** Adds a section of text to the end of the page, written over its placeholder content. */
export const addTextSection = async (
  page: Page,
  canvas: FrameLocator,
  heading: string,
  body: string,
) => {
  await page.getByRole("tab", { name: "Outline" }).click();
  await page
    .getByRole("tabpanel", { name: "Outline" })
    .getByRole("button", { name: "Add a section" })
    .click();
  await page.getByPlaceholder("Search blocks").fill("Text");
  await page.keyboard.press("Enter");
  const section = canvas.locator('[data-pakshi-block]:has([data-pakshi-field="body"])').last();
  await typeInto(page, section.locator('[data-pakshi-field="heading"]'), heading);
  await typeInto(page, section.locator('[data-pakshi-field="body"]'), body);
  await expect(page.getByText("Saved to the draft")).toBeVisible();
};

/**
 * Adds a form section to the end of the page, with a new form whose consent
 * checkbox links to the page it's on.
 */
export const addFormSection = async (page: Page, canvas: FrameLocator, heading: string) => {
  await page.getByRole("tab", { name: "Outline" }).click();
  await page
    .getByRole("tabpanel", { name: "Outline" })
    .getByRole("button", { name: "Add a section" })
    .click();
  await page.getByPlaceholder("Search blocks").fill("Form");
  await page.keyboard.press("Enter");
  const section = canvas.locator("[data-pakshi-block]:has(form)").last();
  await typeInto(page, section.locator('[data-pakshi-field="heading"]'), heading);
  await typeInto(page, section.locator('[data-pakshi-field="intro"]'), "We reply within a day.");
  await page.getByLabel("Form", { exact: true }).selectOption({ label: "Start a new form" });
  await page.getByLabel("Links to", { exact: true }).selectOption({ index: 1 });
  await expect(page.getByText("Saved to the draft")).toBeVisible();
};

/** Has a form's new entries emailed to an address, from the site's settings. */
export const emailEntriesTo = async (page: Page, site: string, form: string, email: string) => {
  await visit(page, `${studioUrl}/sites/${site}/settings/forms`);
  await page.getByLabel(`Add an email address for ${form}`, { exact: true }).fill(email);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
};

/** Gives the page open in the editor its description, which publishing needs. */
export const describePage = async (page: Page, description: string) => {
  // With a block selected, the settings panel shows it; Page settings goes back to the page's.
  const pageSettings = page.getByRole("button", { name: "Page settings" });
  if (await pageSettings.isVisible()) await pageSettings.click();
  await page.getByLabel("Description", { exact: true }).fill(description);
  await expect(page.getByText("Saved to the draft")).toBeVisible();
};

/** Submits the draft open in the editor. With no approval steps, that publishes it. */
export const submit = async (page: Page, action: "Publish" | "Submit for approval") => {
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  const dialog = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("button", { name: action }) });
  await dialog.getByRole("button", { name: action }).click();
  await expect(dialog).toBeHidden();
};

/** Starts a draft from a site's drafts list, and returns the draft's address in Studio. */
export const newDraft = async (page: Page, site: string, name: string) => {
  await visit(page, `${studioUrl}/sites/${site}`);
  const dialog = page.getByRole("dialog", { name: "New draft" });
  await clickWhenReady(page.getByRole("button", { name: "New draft" }).first(), dialog);
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Start draft" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  return page.url();
};

/** A draft's preview address, which Studio serves to anyone the draft is shared with. */
export const previewOf = (site: string, draftUrl: string) =>
  `${studioUrl}/preview/${site}/${new URL(draftUrl).pathname.split("/").at(-1) ?? ""}/`;
