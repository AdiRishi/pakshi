import { expect, type FrameLocator, test } from "@playwright/test";

import {
  addTextSection,
  browserFor,
  createBrand,
  createSite,
  openHome,
  unique,
  uniqueAddress,
} from "./support/studio.ts";

const heading = (canvas: FrameLocator) =>
  canvas.locator(
    '[data-pakshi-block]:has([data-pakshi-field="body"]) [data-pakshi-field="heading"]',
  );

// This test calls the real model, which costs money, so it runs only when asked for.
test.skip(
  process.env["PAKSHI_AGENT_TESTS"] !== "1",
  "Set PAKSHI_AGENT_TESTS=1 to run tests that call the model.",
);

test("the agent edits a draft for its person, and its turn undoes whole", async ({ browser }) => {
  const priya = await browserFor(browser, "admin");
  const brand = unique("City Libraries");
  const site = unique("Library Events");
  await createBrand(priya, brand);
  const draft = await createSite(priya, site, brand, uniqueAddress("events"));
  const canvas = await openHome(priya, draft);
  await addTextSection(priya, canvas, "Story time", "Every Saturday at ten.");

  await priya.getByRole("tab", { name: "Ask Pakshi" }).click();
  await priya
    .getByLabel("Message Pakshi", { exact: true })
    .fill("Change the heading 'Story time' to 'Story hour'.");
  await priya.getByLabel("Message Pakshi", { exact: true }).press("Enter");
  await expect(heading(canvas)).toHaveText("Story hour", { timeout: 120_000 });
  const changes = priya.getByRole("region", { name: "Changes" });
  await expect(changes).toContainText("1 change to the draft", { timeout: 120_000 });

  await changes.getByRole("button", { name: "Undo" }).click();
  await expect(heading(canvas)).toHaveText("Story time");
});
