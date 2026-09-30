import { writeFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type FrameLocator, type Page, test } from "@playwright/test";

import { fixtureSites, fixturesPath } from "../src/fixture-sites.ts";
import { differingPixels } from "./support/pixels.ts";
import { newDraft, signedIn } from "./support/studio.ts";

const sitesUrl = new URL(process.env.SITES_URL ?? "http://localhost");

const sites = await fixtureSites();

const wcag = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

/** A browser page signed in to Studio as the org admin, who can edit every site. */
const asAdmin = (browser: Browser) => signedIn(browser, "Meera Kapoor");

/** Each site's draft for these tests, started the first time a test opens the site. */
const drafts = new Map<string, string>();

const draftOf = async (page: Page, site: string) => {
  const known = drafts.get(site);
  if (known !== undefined) return known;
  const url = await newDraft(page, site, "Editor tests");
  drafts.set(site, url);
  return url;
};

const fixturesUrl = (site: (typeof sites)[number]) =>
  `${sitesUrl.protocol}//${site.host(sitesUrl.host)}${fixturesPath}`;

/** The blocks a fixture site shows: its header, each section and item on the fixtures page, its footer. */
const blocksOf = (site: (typeof sites)[number]) => {
  const fixtures = site.pages.find(({ page }) => page.path === fixturesPath)?.page;
  const sections = (fixtures?.root ?? []).flatMap((id) => [
    id,
    ...Object.values(fixtures?.blocks[id]?.slots ?? {}).flat(),
  ]);
  return [site.manifest.parts.header, ...sections, site.manifest.parts.footer];
};

const openCanvas = async (
  page: Page,
  site: (typeof sites)[number],
  scheme: "light" | "dark",
): Promise<FrameLocator> => {
  await page.goto(`${await draftOf(page, site.site.id)}/pages/${site.page}`);
  await page.getByRole("button", { name: scheme === "dark" ? "Dark" : "Light" }).click();
  const frame = page.frameLocator("iframe[title^='Canvas']");
  await expect(frame.locator("[data-pakshi-block]").first()).toBeVisible();
  // The editor draws its controls, such as a Needs content badge, over the page; this compares the page.
  await frame.locator("head").evaluate((head) => {
    const style = head.ownerDocument.createElement("style");
    style.textContent = ".pakshi-overlay { display: none; }";
    head.appendChild(style);
  });
  // Every image loads now, however far down the page, so screenshots never catch one loading.
  await frame.locator("body").evaluate((body) =>
    Promise.all(
      Array.from(body.ownerDocument.images, (image) => {
        image.loading = "eager";
        return image.decode().catch(() => undefined);
      }),
    ),
  );
  // A window taller than the page keeps the canvas from scrolling, so no block meets the
  // frame's edge, where a screenshot would pick up Studio behind it.
  const height = await frame.locator("html").evaluate((html) => html.scrollHeight);
  await page.setViewportSize({ width: 1440, height: height + 400 });
  // Nothing hovered, focused or selected, so no editor marks show.
  await page.mouse.move(0, 0);
  return frame;
};

const openPublished = async (
  browser: Browser,
  site: (typeof sites)[number],
  width: number,
  scheme: "light" | "dark",
) => {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme: scheme,
  });
  const page = await context.newPage();
  await page.goto(fixturesUrl(site));
  await page.evaluate(() =>
    Promise.all(
      Array.from(document.images, (image) => {
        image.loading = "eager";
        return image.decode().catch(() => undefined);
      }),
    ),
  );
  return page;
};

for (const scheme of ["light", "dark"] as const) {
  test(`every block fixture renders the same in the editor canvas and in sites, in ${scheme}`, async ({
    browser,
  }) => {
    const studio = await asAdmin(browser);
    for (const site of sites) {
      const frame = await openCanvas(studio, site, scheme);
      const width = (await studio.locator("iframe[title^='Canvas']").boundingBox())?.width ?? 0;
      const published = await openPublished(browser, site, Math.round(width), scheme);
      for (const block of blocksOf(site)) {
        const inCanvas = frame.locator(`[data-pakshi-block="${block}"]`);
        // The canvas renders into a container where sites renders into the body, so the
        // same element is found in sites by its position under the body.
        const position = await inCanvas.evaluate((element) => {
          const steps: Array<number> = [];
          let current: Element = element;
          while (current.parentElement !== null) {
            const parent: Element = current.parentElement;
            steps.unshift(Array.from(parent.children).indexOf(current) + 1);
            if (parent.hasAttribute("data-pakshi-canvas")) break;
            current = parent;
          }
          return steps;
        });
        const inSites = published.locator(
          `body > ${position.map((index) => `:nth-child(${index})`).join(" > ")}`,
        );
        // Blocks have fractional edges, and an element screenshot rounds them differently
        // inside a frame. Both sides clip the same whole pixels inside the block instead.
        const inner = (rect: { x: number; y: number; width: number; height: number }) => {
          const x = Math.ceil(rect.x);
          const y = Math.ceil(rect.y);
          return {
            x,
            y,
            width: Math.floor(rect.x + rect.width) - x,
            height: Math.floor(rect.y + rect.height) - y,
          };
        };
        const box = (element: Element) => {
          const rect = element.getBoundingClientRect();
          return {
            x: rect.x + scrollX,
            y: rect.y + scrollY,
            width: rect.width,
            height: rect.height,
          };
        };
        const frameBox = await studio.locator("iframe[title^='Canvas']").boundingBox();
        const canvasBox = inner(await inCanvas.evaluate(box));
        const canvasShot = await studio.screenshot({
          clip: {
            ...canvasBox,
            x: canvasBox.x + (frameBox?.x ?? 0),
            y: canvasBox.y + (frameBox?.y ?? 0),
          },
        });
        const sitesShot = await published.screenshot({
          fullPage: true,
          clip: inner(await inSites.evaluate(box)),
        });
        const differing = await differingPixels(published, canvasShot, sitesShot);
        // An image's rounded corner can anti-alias a pixel or two differently. A real
        // difference, even a one-pixel line across the block, is far more than this.
        const matches = differing !== null && differing <= 0.0001;
        if (!matches)
          for (const [where, shot] of [
            ["canvas", canvasShot],
            ["sites", sitesShot],
          ] as const) {
            const path = test.info().outputPath(`${block}-${where}.png`);
            await writeFile(path, shot);
            await test.info().attach(`${block} in ${where}`, { path, contentType: "image/png" });
          }
        expect(matches, `${site.site.name}: ${block} differs in ${differing} of its pixels`).toBe(
          true,
        );
      }
      await published.close();
    }
  });

  test(`axe finds no violations on the block fixtures in ${scheme}`, async ({ browser }) => {
    for (const site of sites) {
      const page = await openPublished(browser, site, 1280, scheme);
      const results = await new AxeBuilder({ page }).withTags(wcag).analyze();
      expect(results.violations, site.site.name).toEqual([]);
      await page.close();
    }
  });
}

test("axe finds no violations on the editor screen", async ({ browser }) => {
  const [site] = sites;
  if (site === undefined) throw new Error("There are no fixture sites.");
  const studio = await asAdmin(browser);
  await openCanvas(studio, site, "light");
  const results = await new AxeBuilder({ page: studio })
    .withTags(wcag)
    // The canvas is the site's own page, which the fixture checks above cover.
    .exclude("iframe[title^='Canvas']")
    .analyze();
  expect(results.violations).toEqual([]);
});

/** Puts the caret after a text field's last character, as End would on a single line. */
const caretAtEnd = (field: ReturnType<FrameLocator["getByRole"]>) =>
  field.evaluate((element) => {
    element.focus();
    const selection = element.ownerDocument.getSelection();
    selection?.selectAllChildren(element);
    selection?.collapseToEnd();
  });

test("an edit survives a reload, and undo reverses one action at a time", async ({ browser }) => {
  const studio = await asAdmin(browser);
  await studio.goto(`${await draftOf(studio, "site_harbour")}/pages/pg_programme`);
  const frame = studio.frameLocator("iframe[title^='Canvas']");
  const heading = frame.getByRole("textbox", { name: "Heading" }).first();
  const description = studio.getByLabel("Description");
  const original = {
    heading: (await heading.textContent()) ?? "",
    description: await description.inputValue(),
  };

  await caretAtEnd(heading);
  await studio.keyboard.type(" this July");
  await expect(studio.getByText("Saved to the draft")).toBeVisible();
  await studio.reload();
  await expect(heading).toHaveText(`${original.heading} this July`);

  // Two actions in this session: a burst of typing in the heading, then a new description.
  await caretAtEnd(heading);
  await studio.keyboard.type("!");
  await studio.getByRole("button", { name: "Page settings" }).click();
  await description.fill("Five days of workshops.");
  await description.blur();
  await studio.getByRole("button", { name: "Undo" }).click();
  await expect(description).toHaveValue(original.description);
  await expect(heading).toHaveText(`${original.heading} this July!`);
  await studio.getByRole("button", { name: "Undo" }).click();
  await expect(heading).toHaveText(`${original.heading} this July`);

  // Put the sample page back as it was.
  await heading.focus();
  await studio.keyboard.press("ControlOrMeta+a");
  await studio.keyboard.type(original.heading);
  await studio.mouse.click(5, 5);
  await expect(heading).toHaveText(original.heading);
  await expect(studio.getByText("Saved to the draft")).toBeVisible();
});

test("a section dragged by its handle in the canvas moves, and undo puts it back", async ({
  browser,
}) => {
  const studio = await asAdmin(browser);
  await studio.setViewportSize({ width: 1440, height: 2000 });
  await studio.goto(`${await draftOf(studio, "site_harbour")}/pages/pg_home`);
  const frame = studio.frameLocator("iframe[title^='Canvas']");
  const sections = () =>
    studio
      .getByRole("tree", { name: "Page outline" })
      .locator("[role=treeitem][aria-level='1']")
      .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-pakshi-outline-block")));
  await expect.poll(async () => (await sections()).length).toBeGreaterThan(3);
  const before = await sections();
  // The header comes first and can't move, so the first two sections swap.
  const [header, first, second, ...rest] = before;
  await frame.locator(`[data-pakshi-block="${first}"]`).hover();
  const handle = await frame.locator(".pakshi-handle").boundingBox();
  const target = await frame.locator(`[data-pakshi-block="${second}"]`).boundingBox();
  if (handle === null || target === null) throw new Error("The canvas shows no handle or target.");
  await studio.mouse.move(handle.x + 6, handle.y + handle.height / 2);
  await studio.mouse.down();
  await studio.mouse.move(target.x + target.width / 2, target.y + target.height - 12, {
    steps: 16,
  });
  await studio.mouse.up();
  await expect.poll(sections).toEqual([header, second, first, ...rest]);

  await studio.getByRole("button", { name: "Undo" }).click();
  await expect.poll(sections).toEqual(before);
  await expect(studio.getByText("Saved to the draft")).toBeVisible();
});
