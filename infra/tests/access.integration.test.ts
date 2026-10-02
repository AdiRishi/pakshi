import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import {
  browserFor,
  clickWhenReady,
  createBrand,
  createSite,
  invite,
  joinFrom,
  openHome,
  studioUrl,
  unique,
  uniqueAddress,
  visit,
} from "./support/studio.ts";

/**
 * What axe finds on the page against WCAG 2.2 AA, once anything opening has
 * finished fading in: halfway through, its text has less contrast than it ends with.
 */
const violations = async (page: Page) => {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== "running" ||
          animation.effect?.getComputedTiming().iterations === Infinity,
      ),
  );
  return (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze()
  ).violations;
};

test("an org admin shapes who can do what, and every screen for it meets WCAG 2.2 AA", async ({
  browser,
}) => {
  const priya = await browserFor(browser, "admin");
  const brand = unique("City Libraries");
  const site = unique("Northbank Libraries");
  const address = uniqueAddress("northbank");
  const role = unique("Content reviewer");
  await createBrand(priya, brand);
  const draft = await createSite(priya, site, brand, address);
  const siteId = new URL(draft).pathname.split("/")[2] ?? "";
  const sam = await joinFrom(
    browser,
    await invite(priya, `sam-${address}@riverton.test`, site, "Editor"),
    "Sam Okafor",
  );

  // A custom role, from the Roles screen.
  await visit(priya, `${studioUrl}/roles`);
  await clickWhenReady(
    priya.getByRole("button", { name: "New role" }),
    priya.getByRole("heading", { name: "New role" }),
  );
  await priya.getByLabel("Name", { exact: true }).fill(role);
  await priya.getByRole("checkbox", { name: "Create and edit drafts" }).click();
  await priya.getByRole("checkbox", { name: "Approve or request changes" }).click();
  expect(await violations(priya)).toEqual([]);
  await priya.getByRole("button", { name: "Create role" }).click();
  await expect(priya.getByText("Role created")).toBeVisible();

  // Sam gets it on the site, and loses sharing there, from the People screen.
  await visit(priya, `${studioUrl}/people`);
  const sheet = priya.getByRole("dialog", { name: "Sam Okafor" });
  await clickWhenReady(priya.getByRole("button", { name: "Manage Sam Okafor's access" }), sheet);
  await sheet.getByRole("button", { name: "Add access" }).click();
  await sheet.getByLabel("Where", { exact: true }).selectOption({ label: `${site} only` });
  await sheet.getByLabel("Role", { exact: true }).selectOption({ label: role });
  await sheet.getByRole("button", { name: "Add access" }).last().click();
  await expect(sheet.getByText(role, { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Add override" }).click();
  await sheet.getByLabel("Where", { exact: true }).selectOption({ label: `${site} only` });
  await sheet.getByLabel("Permission", { exact: true }).selectOption({ label: "Share drafts" });
  await sheet.getByRole("button", { name: "Off", exact: true }).click();
  await sheet.getByRole("button", { name: "Add override" }).last().click();
  await expect(sheet.getByText("Switched off")).toBeVisible();
  expect(await violations(priya)).toEqual([]);

  // The site's members show both of Sam's roles there.
  await visit(priya, `${studioUrl}/sites/${siteId}/settings/members`);
  await expect(priya.getByRole("combobox", { name: "Role for Sam Okafor" })).toHaveCount(2);
  expect(await violations(priya)).toEqual([]);

  // Every change is in the audit log.
  await visit(priya, `${studioUrl}/audit`);
  await expect(priya.getByText(`Gave Sam Okafor ${role} on ${site}`)).toBeVisible();
  await expect(
    priya.getByText(`Override for Sam Okafor: switched off Share drafts on ${site}`),
  ).toBeVisible();
  expect(await violations(priya)).toEqual([]);

  await visit(priya, `${studioUrl}/metrics`);
  await expect(priya.getByRole("heading", { name: "Time to launch" })).toBeVisible();
  expect(await violations(priya)).toEqual([]);

  // Sam asks for a new block from the blocks page.
  await visit(sam, `${studioUrl}/blocks`);
  const request = sam.getByRole("dialog", { name: "Ask for a new block" });
  await clickWhenReady(sam.getByRole("button", { name: "Ask for a new block" }), request);
  await request
    .getByLabel("What do you need?", { exact: true })
    .fill("A countdown to the reading challenge.");
  expect(await violations(sam)).toEqual([]);
  await request.getByRole("button", { name: "Send request" }).click();
  await expect(sam.getByText("A countdown to the reading challenge.")).toBeVisible();

  // The new page's checks, from the editor's top bar.
  await openHome(sam, draft);
  await sam.getByRole("button", { name: /to fix|Checks pass/ }).click();
  await expect(sam.getByRole("dialog", { name: /to fix|passes its checks/ })).toBeVisible();
  expect(await violations(sam)).toEqual([]);
});
