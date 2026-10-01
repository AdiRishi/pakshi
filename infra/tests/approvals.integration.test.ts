import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  addTextSection,
  browserFor,
  clickWhenReady,
  createBrand,
  createSite,
  describePage,
  invite,
  joinFrom,
  openHome,
  siteAddress,
  studioUrl,
  submit,
  unique,
  uniqueAddress,
} from "./support/studio.ts";

test("a change goes through the site's approval step to live", async ({ browser }) => {
  const priya = await browserFor(browser, "admin");
  const brand = unique("City Parks");
  const site = unique("Parks Volunteers");
  const address = uniqueAddress("volunteers");
  await createBrand(priya, brand);
  const draft = await createSite(priya, site, brand, address);
  const siteId = new URL(draft).pathname.split("/")[2] ?? "";

  // The site's own workflow: one step, for anyone with the approver role there.
  await priya.goto(`${studioUrl}/sites/${siteId}/settings/workflow`);
  const inherit = priya.getByRole("switch", { name: "Use the brand's workflow" });
  await clickWhenReady(inherit, priya.getByRole("button", { name: "Add step" }));
  await priya.getByRole("button", { name: "Add step" }).click();
  await priya.getByLabel("Step name").fill("Communications team");
  const results = await new AxeBuilder({ page: priya })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await priya.getByRole("button", { name: "Save workflow" }).click();
  await expect(priya.getByText("Approval workflow saved")).toBeVisible();

  const sam = await joinFrom(
    browser,
    await invite(priya, `sam-${address}@riverton.test`, site, "Editor"),
    "Sam Okafor",
  );
  const jonah = await joinFrom(
    browser,
    await invite(priya, `jonah-${address}@riverton.test`, site, "Approver"),
    "Jonah Reyes",
  );

  const canvas = await openHome(sam, draft);
  await addTextSection(sam, canvas, "Volunteer with us", "Plant trees on Saturday mornings.");
  await describePage(sam, "Volunteer days in the city's parks.");
  await submit(sam, "Submit for approval");
  await expect(sam.getByText("Launch is sent for approval")).toBeVisible();

  await jonah.goto(`${studioUrl}/approvals`);
  await jonah.getByRole("link", { name: "Review Launch" }).click();
  await expect(async () => {
    await jonah.getByRole("button", { name: "Approve and publish" }).click({ timeout: 1000 });
    await expect(jonah).toHaveURL(`${studioUrl}/approvals`, { timeout: 5000 });
  }).toPass();
  await expect
    .poll(async () => (await jonah.request.get(siteAddress(address))).text())
    .toContain("Volunteer with us");
});
