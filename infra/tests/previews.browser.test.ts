import { expect, test } from "@playwright/test";

import { fixtureSites, fixturesPath } from "../src/fixture-sites.ts";
import { differingPixels } from "./support/pixels.ts";
import { newDraft, previewOf, signedIn, sitesUrl, studioUrl } from "./support/studio.ts";

const sites = await fixtureSites();

test("a preview opens only for the people it's shared with, and revoking access blocks the next request", async ({
  browser,
}) => {
  const sam = await signedIn(browser, "Sam Okafor");
  const jonah = await signedIn(browser, "Jonah Reyes");
  const draft = await newDraft(sam, "site_harbour", "Private preview");
  const preview = previewOf("site_harbour", draft);

  // Jonah can't edit the site's pages, so only a share lets him in.
  await jonah.goto(preview);
  await expect(jonah.getByRole("heading", { name: "This preview isn't available" })).toBeVisible();

  const shareWith = async (change: () => Promise<void>) => {
    await sam.getByRole("button", { name: "Share" }).click();
    const dialog = sam.getByRole("dialog", { name: 'Share "Private preview"' });
    await expect(dialog.getByText("People with access")).toBeVisible();
    await change();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
  };
  await shareWith(async () => {
    await sam.getByRole("combobox", { name: "Add people" }).fill("Jonah");
    await sam.getByRole("option", { name: /Jonah Reyes/ }).click();
  });

  const opened = await jonah.goto(preview);
  expect(opened?.status()).toBe(200);
  expect(opened?.headers()).toMatchObject({
    "x-robots-tag": "noindex, nofollow",
    "referrer-policy": "no-referrer",
    "cache-control": "private, no-store",
  });
  await expect(jonah.getByRole("heading", { name: "Learn by building" })).toBeVisible();
  await expect(jonah.getByRole("complementary", { name: "Preview" })).toContainText(
    'Preview of the "Private preview" draft',
  );

  // Someone who isn't signed in is asked to, and comes back to the preview.
  const visitor = await browser.newPage();
  await visitor.goto(preview);
  await expect(visitor).toHaveURL(/\/sign-in\?redirect=/);

  await shareWith(() => sam.getByRole("button", { name: "Remove Jonah Reyes" }).click());
  await jonah.reload();
  await expect(jonah.getByRole("heading", { name: "This preview isn't available" })).toBeVisible();
});

test("a preview's forms don't submit", async ({ browser }) => {
  const meera = await signedIn(browser, "Meera Kapoor");
  const [site] = sites;
  if (site === undefined) throw new Error("There's a fixture site.");
  const draft = await newDraft(meera, site.site.id, "Form check");
  await meera.goto(previewOf(site.site.id, draft));
  const forms = meera.locator("form");
  await expect(forms.first()).toBeVisible();
  for (const button of await forms.getByRole("button").all()) await expect(button).toBeDisabled();
});

for (const scheme of ["light", "dark"] as const) {
  test(`a preview renders each fixture site's page as sites does, in ${scheme}`, async ({
    browser,
  }) => {
    const meera = await signedIn(browser, "Meera Kapoor");
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      colorScheme: scheme,
    });
    const published = await context.newPage();
    const shown = await context.newPage();
    const sitesHost = new URL(sitesUrl);
    for (const site of sites) {
      const draft = await newDraft(meera, site.site.id, `Preview parity ${scheme}`);
      // The preview needs the draft's sharing to open in another context, so it opens signed in.
      await shown.context().addCookies(await meera.context().cookies(studioUrl));
      await shown.goto(previewOf(site.site.id, draft));
      await published.goto(`${sitesHost.protocol}//${site.host(sitesHost.host)}${fixturesPath}`);
      for (const page of [shown, published])
        await page.evaluate(() => {
          // The preview's bar sits above the page, and forms can't send in a preview.
          document.querySelector("aside[aria-label='Preview']")?.remove();
          for (const button of document.querySelectorAll("form button"))
            button.removeAttribute("disabled");
          return Promise.all(
            Array.from(document.images, (image) => {
              image.loading = "eager";
              return image.decode().catch(() => undefined);
            }),
          );
        });
      const previewShot = await shown.screenshot({ fullPage: true, animations: "disabled" });
      const sitesShot = await published.screenshot({ fullPage: true, animations: "disabled" });
      expect(await differingPixels(shown, previewShot, sitesShot)).toBeLessThan(0.001);
    }
  });
}
