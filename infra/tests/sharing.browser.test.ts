import { expect, test } from "@playwright/test";

import { appendToHeading, newDraft, openInEditor, signedIn } from "./support/studio.ts";

test("someone a draft is shared with for editing edits it, images and all, until the share ends", async ({
  browser,
}) => {
  const sam = await signedIn(browser, "Sam Okafor");
  const jonah = await signedIn(browser, "Jonah Reyes");
  const name = `Shared edit ${Date.now().toString(36)}`;
  const draft = await newDraft(sam, "site_harbour", name);

  // Jonah can't edit the site's pages, so only the share lets him in.
  const share = async (change: () => Promise<void>) => {
    await sam.getByRole("button", { name: "Share" }).click();
    const dialog = sam.getByRole("dialog", { name: `Share "${name}"` });
    await expect(dialog.getByText("People with access")).toBeVisible();
    await change();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
  };
  await share(async () => {
    await sam.getByRole("combobox", { name: "Add people" }).fill("Jonah");
    await sam.getByRole("option", { name: /Jonah Reyes/ }).click();
    await sam.getByLabel("Access for Jonah Reyes").selectOption("edit");
  });

  const canvas = await openInEditor(jonah, draft, "pg_home");
  await expect
    .poll(() =>
      canvas
        .locator("img")
        .first()
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await appendToHeading(jonah, canvas, "b_about", " together");

  await share(() => sam.getByRole("button", { name: "Remove Jonah Reyes" }).click());
  await expect(
    jonah.getByRole("alertdialog", { name: "You can no longer edit this draft" }),
  ).toBeVisible();
});
