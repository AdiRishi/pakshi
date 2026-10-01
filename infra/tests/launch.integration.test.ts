import { expect, test } from "@playwright/test";

import {
  addTextSection,
  browserFor,
  createBrand,
  createSite,
  describePage,
  invite,
  joinFrom,
  openHome,
  siteAddress,
  submit,
  unique,
  uniqueAddress,
} from "./support/studio.ts";

test("an admin makes a site, and an editor they invite builds it and publishes it at its subdomain", async ({
  browser,
}) => {
  const priya = await browserFor(browser, "admin");
  const brand = unique("City Libraries");
  const site = unique("Northbank Libraries");
  const address = uniqueAddress("northbank");
  await createBrand(priya, brand);
  const draft = await createSite(priya, site, brand, address);
  await expect(async () => {
    const response = await priya.request.get(siteAddress(address));
    expect(await response.text()).toContain("been published yet.");
  }).toPass();

  const link = await invite(priya, `sam-${address}@riverton.test`, site, "Editor");
  const sam = await joinFrom(browser, link, "Sam Okafor");
  const canvas = await openHome(sam, draft);
  await addTextSection(sam, canvas, "Welcome to Northbank", "Borrow books and join free events.");
  await describePage(sam, "Northbank's libraries: borrowing, events and study spaces.");
  await submit(sam, "Publish");

  const home = siteAddress(address);
  await expect
    .poll(async () => (await sam.request.get(home)).text())
    .toContain("Welcome to Northbank");
  const visitor = await browserFor(browser, "visitor");
  await visitor.goto(home);
  await expect(visitor.getByRole("heading", { name: "Welcome to Northbank" })).toBeVisible();
  // Each location renders a page once per release, then serves it from its cache.
  const again = await visitor.request.get(home);
  expect(again.headers()["x-pakshi-cache"]).toBe("hit");
});
