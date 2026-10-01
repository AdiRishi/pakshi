import { expect, test } from "@playwright/test";

import {
  addFormSection,
  addTextSection,
  browserFor,
  connectDomain,
  createBrand,
  createSite,
  describePage,
  domainAddress,
  emailEntriesTo,
  openHome,
  siteAddress,
  studioUrl,
  submit,
  unique,
  uniqueAddress,
} from "./support/studio.ts";

test("a visitor sends a form on a site's own domain, and its admin reads, exports and deletes the entry", async ({
  browser,
}) => {
  const priya = await browserFor(browser, "admin");
  const brand = unique("City Libraries");
  const address = uniqueAddress("rooms");
  await createBrand(priya, brand);
  const draft = await createSite(priya, unique("Northbank Rooms"), brand, address);
  const site = new URL(draft).pathname.split("/")[2] ?? "";

  const canvas = await openHome(priya, draft);
  await addTextSection(priya, canvas, "Book a room", "Rooms for groups of up to twenty.");
  await addFormSection(priya, canvas, "Ask for a room");
  await describePage(priya, "Book a room at Northbank library.");
  await emailEntriesTo(priya, site, "New form", "rooms@riverton.test");
  await priya.goto(draft);
  await priya.getByRole("link", { name: "Edit" }).first().click();
  await submit(priya, "Publish");

  // Rendered first at the platform address, so the domain must not be handed its cached page.
  await expect(await priya.request.get(siteAddress(address))).toBeOK();
  const hostname = `${address}.riverton.localhost`;
  await connectDomain(priya, site, hostname);

  const visitor = await browserFor(browser, "visitor");
  const home = domainAddress(hostname);
  await expect
    .poll(async () => (await visitor.request.get(home)).text())
    .toContain("Ask for a room");
  await visitor.goto(home);
  await expect(visitor.locator("link[rel=canonical]")).toHaveAttribute("href", `${home}/`);
  await visitor.getByLabel("Your name").fill("Ama Mensah");
  await visitor.getByLabel("Email").fill("ama@example.org");
  await visitor.getByLabel("I agree to the privacy policy").check();
  await visitor.getByRole("button", { name: "Send" }).click();
  await expect(visitor.getByText("Thank you. Your answers were sent.")).toBeVisible();

  await priya.goto(`${studioUrl}/sites/${site}/submissions`);
  await priya.getByRole("link", { name: "ama@example.org" }).click();
  await expect(priya.getByRole("dialog")).toContainText("Ama Mensah");
  const download = priya.waitForEvent("download");
  await priya.keyboard.press("Escape");
  await priya.getByRole("link", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);

  await priya.getByRole("button", { name: "Delete a person's data" }).click();
  await priya.getByLabel("Their email address").fill("ama@example.org");
  await priya.getByRole("button", { name: "Find entries" }).click();
  await priya.getByRole("button", { name: "Delete 1 entry" }).click();
  await expect(priya.getByText("Nothing has been sent yet.")).toBeVisible();
});
