import { expect, test } from "@playwright/test";

import {
  addTextSection,
  browserFor,
  clickWhenReady,
  createBrand,
  createSite,
  describePage,
  newDraft,
  openHome,
  siteAddress,
  submit,
  unique,
  uniqueAddress,
  visit,
} from "./support/studio.ts";

test("an unpublished page leaves the menus and the sitemap, and its address says it has gone", async ({
  browser,
}) => {
  const priya = await browserFor(browser, "admin");
  const brand = unique("City Libraries");
  const address = uniqueAddress("pages");
  await createBrand(priya, brand);
  const launch = await createSite(priya, unique("Riverside Library"), brand, address);
  const site = new URL(launch).pathname.split("/")[2] ?? "";

  const home = await openHome(priya, launch);
  await addTextSection(priya, home, "Riverside Library", "Books, events and quiet rooms.");
  await describePage(priya, "Riverside Library's books, events and rooms.");

  await visit(priya, launch);
  const dialog = priya.getByRole("dialog", { name: "New page" });
  await clickWhenReady(priya.getByRole("button", { name: "New page" }), dialog);
  await dialog.getByLabel("Title", { exact: true }).fill("Opening hours");
  await dialog.getByRole("button", { name: "Create page" }).click();
  const canvas = priya.frameLocator("iframe[title^='Canvas']");
  await addTextSection(priya, canvas, "Opening hours", "Open every day from nine.");
  await describePage(priya, "When Riverside Library is open.");

  await visit(priya, launch);
  const menus = priya.getByRole("region", { name: "Main menu" });
  await clickWhenReady(
    menus.getByRole("button", { name: "Add item" }),
    menus.getByLabel("Links to", { exact: true }),
  );
  await menus.getByLabel("Links to", { exact: true }).selectOption({ label: "Opening hours" });
  await menus.getByLabel("Label", { exact: true }).fill("Hours");
  await menus.getByLabel("Label", { exact: true }).blur();
  await expect(menus.getByLabel("Label", { exact: true })).toHaveValue("Hours");
  await submit(priya, "Publish");

  const visitor = await browserFor(browser, "visitor");
  const live = siteAddress(address);
  await expect.poll(async () => (await visitor.request.get(live)).text()).toContain("Hours");
  expect(await (await visitor.request.get(`${live}/sitemap.xml`)).text()).toContain(
    "/opening-hours",
  );

  const draft = await newDraft(priya, site, "Close the hours page");
  await visit(priya, draft);
  await priya.getByRole("button", { name: "More for Opening hours" }).click();
  await priya.getByRole("menuitem", { name: "Unpublish" }).click();
  const confirm = priya.getByRole("alertdialog");
  await expect(confirm).toContainText("Its menu item is removed in this draft.");
  await confirm.getByRole("button", { name: "Unpublish" }).click();
  await expect(priya.getByText("Unpublished")).toBeVisible();
  await submit(priya, "Publish");

  await expect
    .poll(async () => (await visitor.request.get(`${live}/opening-hours`)).status())
    .toBe(410);
  expect(await (await visitor.request.get(live)).text()).not.toContain("Hours");
  expect(await (await visitor.request.get(`${live}/sitemap.xml`)).text()).not.toContain(
    "/opening-hours",
  );
});
