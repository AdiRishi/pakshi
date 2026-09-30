import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import {
  appendToHeading,
  liveHome,
  newDraft,
  openInEditor,
  previewOf,
  signedIn,
  studioUrl,
} from "./support/studio.ts";

const site = "site_harbour";

/** Draft names unique to this run, so a stack that ran the suite before holds no others like them. */
const run = Date.now().toString(36);
const summerCopy = `Summer copy ${run}`;
const registerCopy = `Register copy ${run}`;

const noViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .exclude("iframe")
    .analyze();
  expect(results.violations).toEqual([]);
};

/** Sets the site's own workflow: any approver, then Meera. */
const useTwoSteps = async (page: Page) => {
  await page.goto(`${studioUrl}/sites/${site}/workflow`);
  const inherit = page.getByRole("switch", { name: "Use the brand's workflow" });
  await expect(inherit).toBeChecked();
  await inherit.click();
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByLabel("Step name").first().fill("Communications team");
  await page.getByLabel("Step name").last().fill("Site lead");
  await page.getByRole("checkbox", { name: "Approvers" }).last().click();
  await page.getByRole("combobox", { name: "Name someone for step 2" }).fill("Meera");
  await page.getByRole("option", { name: /Meera Kapoor/ }).click();
  await noViolations(page);
  await page.getByRole("button", { name: "Save workflow" }).click();
  await expect(page.getByText("Approval workflow saved")).toBeVisible();
};

/** Puts the site back on its brand's workflow, which has no steps. */
const useBrandWorkflow = async (page: Page) => {
  await page.goto(`${studioUrl}/sites/${site}/workflow`);
  await page.getByRole("switch", { name: "Use the brand's workflow" }).click();
  await page.getByRole("button", { name: "Save workflow" }).click();
  await expect(page.getByText("Approval workflow saved")).toBeVisible();
};

/** Submits the draft open in the editor through the site's two steps. */
const submit = async (page: Page, draft: string) => {
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `Submit "${draft}" for approval` });
  await expect(dialog.getByText("Communications team")).toBeVisible();
  await expect(dialog.getByText("Site lead")).toBeVisible();
  await dialog.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText(`${draft} is sent for approval`)).toBeVisible();
};

type Approval = "Approve" | "Approve and publish";

/** Approves the submission open on the review screen, which returns to the Approvals screen. */
const decide = async (page: Page, action: Approval) => {
  const approvals = `${studioUrl}/approvals`;
  // The page renders on the server, and the button works once it hydrates.
  await expect(async () => {
    if (page.url() !== approvals)
      await page.getByRole("button", { name: action }).click({ timeout: 1000 });
    await expect(page).toHaveURL(approvals, { timeout: 5000 });
  }).toPass();
};

/** Approves a draft's submission from the Approvals screen. */
const approve = async (page: Page, draft: string, action: Approval) => {
  await page.goto(`${studioUrl}/approvals`);
  await page.getByRole("link", { name: `Review ${draft}` }).click();
  await decide(page, action);
};

test("a draft shared by link goes through a two-step workflow, updating itself when another draft publishes", async ({
  browser,
}) => {
  const meera = await signedIn(browser, "Meera Kapoor");
  const sam = await signedIn(browser, "Sam Okafor");
  const jonah = await signedIn(browser, "Jonah Reyes");
  await useTwoSteps(meera);
  try {
    // Sam changes the about heading and shares his draft with anyone who has the link.
    const samDraft = await newDraft(sam, site, summerCopy);
    const samCanvas = await openInEditor(sam, samDraft, "pg_home");
    await appendToHeading(sam, samCanvas, "b_about", " every afternoon");
    await sam.getByRole("button", { name: "Share" }).click();
    const share = sam.getByRole("dialog", { name: `Share "${summerCopy}"` });
    await share.getByLabel("Who else can open this draft").selectOption("link");
    await noViolations(sam);
    await share.getByRole("button", { name: "Save" }).click();
    await expect(share).toBeHidden();

    // Anyone with the link sees the draft, without signing in.
    const visitor = await browser.newPage();
    await visitor.goto(previewOf(site, samDraft));
    await expect(visitor.getByText(/every afternoon/)).toBeVisible();

    await submit(sam, summerCopy);
    await approve(jonah, summerCopy, "Approve");

    // Meanwhile Meera's own draft goes through both steps and publishes.
    const meeraDraft = await newDraft(meera, site, registerCopy);
    const meeraCanvas = await openInEditor(meera, meeraDraft, "pg_home");
    await appendToHeading(meera, meeraCanvas, "b_register", " soon");
    await submit(meera, registerCopy);
    await approve(jonah, registerCopy, "Approve");
    await approve(meera, registerCopy, "Approve and publish");
    await expect.poll(() => liveHome(meera)).toContain("Places are limited soon");

    // Sam's submission merged the release in cleanly, so Jonah's approval stands.
    await meera.goto(`${studioUrl}/approvals`);
    await meera.getByRole("link", { name: `Review ${summerCopy}` }).click();
    await expect(meera.getByText("Approved by Jonah Reyes")).toBeVisible();
    // Links in the live site's page keep to the live site.
    await meera.getByRole("button", { name: "Live site now" }).click();
    await expect(
      meera.frameLocator("iframe").getByRole("link", { name: "Programme" }).first(),
    ).toHaveAttribute("href", /version=live/);
    await expect(meera.getByRole("button", { name: /Added|Heading in/ }).first()).toBeVisible();
    await noViolations(meera);
    await decide(meera, "Approve and publish");
    await expect
      .poll(async () => {
        const html = await liveHome(sam);
        return html.includes("every afternoon") && html.includes("Places are limited soon");
      })
      .toBe(true);
  } finally {
    await useBrandWorkflow(meera);
  }
});

test("the organization can set a workflow of its own, with nothing above it to use", async ({
  browser,
}) => {
  const meera = await signedIn(browser, "Meera Kapoor");
  await meera.goto(`${studioUrl}/organization/workflow`);
  // The page renders on the server, and the button works once it hydrates.
  await expect(async () => {
    await meera.getByRole("button", { name: "Add step" }).click();
    await expect(meera.getByRole("heading", { name: "Step 1" })).toBeVisible({ timeout: 1000 });
  }).toPass();
});
