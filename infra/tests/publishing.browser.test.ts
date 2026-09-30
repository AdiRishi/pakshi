import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import {
  appendToHeading,
  heading,
  liveHome,
  newDraft,
  openInEditor,
  signedIn,
} from "./support/studio.ts";

const wcag = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

const noViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(wcag)
    .exclude("iframe[title^='Canvas']")
    .analyze();
  expect(results.violations).toEqual([]);
};

test("two drafts publish one after the other through an update, and a rollback undoes the latest", async ({
  browser,
}) => {
  const meera = await signedIn(browser, "Meera Kapoor");
  const sam = await signedIn(browser, "Sam Okafor");

  // Each starts a draft from what's live and changes the same heading, differently.
  const meeraDraft = await newDraft(meera, "site_harbour", "Opening hours");
  const samDraft = await newDraft(sam, "site_harbour", "Summer copy");
  await noViolations(sam);
  const meeraCanvas = await openInEditor(meera, meeraDraft, "pg_home");
  const samCanvas = await openInEditor(sam, samDraft, "pg_home");
  const original = (await heading(meeraCanvas, "b_about").textContent()) ?? "";
  // How the live page's HTML writes the heading's last word, which has no characters it escapes.
  const visible = original.split(" ").at(-1) ?? "";
  await appendToHeading(meera, meeraCanvas, "b_about", " each morning");
  await appendToHeading(sam, samCanvas, "b_about", " every afternoon");
  // Sam also changes something Meera doesn't, which merges on its own.
  await appendToHeading(sam, samCanvas, "b_register", " soon");

  // Meera publishes first. Her draft closes, and Sam's editor shows his is behind.
  await meera.getByRole("button", { name: "Submit", exact: true }).click();
  await meera.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
  await expect(meera.getByRole("alertdialog", { name: "You published this draft" })).toBeVisible();
  await expect.poll(() => liveHome(meera)).toContain(`${visible} each morning`);
  await expect(sam.getByText("Behind the live site")).toBeVisible();

  // Sam's publish needs his draft updated first, and the heading needs a decision.
  await sam.getByRole("button", { name: "Submit", exact: true }).click();
  await sam.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
  await expect(sam.getByRole("heading", { name: "Bring this draft up to date" })).toBeVisible();
  const conflict = sam.getByRole("region", { name: "Heading in Rich text" });
  await expect(conflict.getByText(`${original} each morning`)).toBeVisible();
  await expect(conflict.getByText(`${original} every afternoon`)).toBeVisible();
  await expect(sam.getByRole("button", { name: "Finish update" })).toBeDisabled();
  await noViolations(sam);
  await conflict.getByRole("button", { name: "Keep this draft" }).click();
  await expect(conflict.getByRole("button", { name: "Keep this draft" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await sam.getByRole("button", { name: "Finish update" }).click();

  // Updated, the draft publishes with his heading and both drafts' other changes.
  await expect(sam.getByText("Up to date with live")).toBeVisible();
  await sam.getByRole("button", { name: "Submit", exact: true }).click();
  await sam.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
  await expect(sam.getByText("Summer copy is published")).toBeVisible();
  await expect
    .poll(async () => {
      const html = await liveHome(sam);
      return (
        html.includes(`${visible} every afternoon`) && html.includes("Places are limited soon")
      );
    })
    .toBe(true);

  // Meera rolls back Sam's publish, and her release is live again.
  await meera.goto(`${new URL(meeraDraft).origin}/sites/site_harbour/releases`);
  await noViolations(meera);
  await meera.getByRole("button", { name: "Roll back" }).click();
  await meera.getByRole("alertdialog").getByRole("button", { name: "Roll back" }).click();
  await expect(meera.getByText("Rolled back the latest publish")).toBeVisible();
  await expect.poll(() => liveHome(meera)).toContain(`${visible} each morning`);
  await expect(meera.getByRole("button", { name: "Roll back" })).toHaveCount(0);
});
