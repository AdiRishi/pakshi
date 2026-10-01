import { expect, type FrameLocator, test } from "@playwright/test";

import {
  addTextSection,
  browserFor,
  createBrand,
  createSite,
  invite,
  joinFrom,
  openHome,
  unique,
  uniqueAddress,
} from "./support/studio.ts";

const heading = (canvas: FrameLocator) =>
  canvas.locator(
    '[data-pakshi-block]:has([data-pakshi-field="body"]) [data-pakshi-field="heading"]',
  );

test("two people edit one page together and each sees the other's changes as they type", async ({
  browser,
}) => {
  const priya = await browserFor(browser, "admin");
  const brand = unique("Harbour Festival");
  const site = unique("Harbour Lights");
  const address = uniqueAddress("lights");
  await createBrand(priya, brand);
  const draft = await createSite(priya, site, brand, address);
  const sam = await joinFrom(
    browser,
    await invite(priya, `sam-${address}@riverton.test`, site, "Editor"),
    "Sam Okafor",
  );

  const mine = await openHome(priya, draft);
  const theirs = await openHome(sam, draft);
  await expect(
    priya.getByRole("list", { name: "Also editing this draft" }).getByText(/Sam Okafor/),
  ).toBeAttached();

  await addTextSection(priya, mine, "Lantern parade", "Bring a lantern to the harbour.");
  await expect(heading(theirs)).toHaveText("Lantern parade");

  await heading(theirs).click();
  await sam.keyboard.press("End");
  await sam.keyboard.type(" at dusk");
  await expect(mine.locator(".pakshi-presence", { hasText: "Sam is typing" })).toBeVisible();
  await expect(heading(mine)).toHaveText("Lantern parade at dusk");
});
