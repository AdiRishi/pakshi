import { writeFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type FrameLocator, type Page, test } from "@playwright/test";

import { fixtureSites, fixturesPath } from "../src/fixture-sites.ts";

const studioUrl = process.env.STUDIO_URL ?? "";
const sitesUrl = new URL(process.env.SITES_URL ?? "http://localhost");

const sites = await fixtureSites();

const wcag = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

/** A browser page signed in to Studio as the org admin, who can edit every site. */
const signedIn = async (browser: Browser) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(studioUrl);
  await page.getByRole("link", { name: /^Continue with .* account$/ }).click();
  await page.getByRole("button", { name: "Meera Kapoor" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Meera" })).toBeVisible();
  return page;
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
  await page.goto(`${studioUrl}/sites/${site.site.id}/pages/${site.page}`);
  await page.getByRole("button", { name: scheme === "dark" ? "Dark" : "Light" }).click();
  const frame = page.frameLocator("iframe[title^='Canvas']");
  await expect(frame.locator("[data-pakshi-block]").first()).toBeVisible();
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

/**
 * The share of pixels in two screenshots that differ by more than a
 * rasterizing difference, such as a shadow drawn at another sub-pixel offset,
 * or null when their sizes differ. It decodes them in a browser page, so the
 * test needs no image libraries.
 */
const differingPixels = (page: Page, a: Uint8Array, b: Uint8Array) =>
  page.evaluate(
    async ([first, second]) => {
      const pixels = async (data: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext("2d");
        context?.drawImage(image, 0, 0);
        return {
          width: image.width,
          height: image.height,
          data: context?.getImageData(0, 0, image.width, image.height).data,
        };
      };
      const [x, y] = [await pixels(first), await pixels(second)];
      if (
        x.width !== y.width ||
        x.height !== y.height ||
        x.data === undefined ||
        y.data === undefined
      )
        return null;
      let count = 0;
      for (let index = 0; index < x.data.length; index += 4) {
        const channels = [0, 1, 2].map((channel) =>
          Math.abs((x.data?.[index + channel] ?? 0) - (y.data?.[index + channel] ?? 0)),
        );
        if (Math.max(...channels) > 32) count += 1;
      }
      return count / (x.width * x.height);
    },
    [Buffer.from(a).toString("base64"), Buffer.from(b).toString("base64")] as const,
  );

for (const scheme of ["light", "dark"] as const) {
  test(`every block fixture renders the same in the editor canvas and in sites, in ${scheme}`, async ({
    browser,
  }) => {
    const studio = await signedIn(browser);
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
  const studio = await signedIn(browser);
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
  const studio = await signedIn(browser);
  await studio.goto(`${studioUrl}/sites/site_harbour/pages/pg_programme`);
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
