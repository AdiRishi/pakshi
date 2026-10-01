import { writeFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type FrameLocator, type Page, test } from "@playwright/test";

import { fixtureSites, fixturesPath } from "../src/fixture-sites.ts";
import { differingPixels } from "./support/pixels.ts";
import { browserFor, newDraft, previewOf, studioUrl } from "./support/studio.ts";

const sitesUrl = new URL(process.env.SITES_URL ?? "http://localhost");

/*
 * Every fixture of every block version, as sites, the editor canvas and
 * draft previews render it. The fixture sites are seeded into the test stage:
 * older block versions live only on sites made before newer ones existed, and
 * nothing in Pakshi moves a site back to one.
 */

const sites = await fixtureSites();

const wcag = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

/** Studio as the organization's admin, who can edit every site. */
const asAdmin = (browser: Browser) => browserFor(browser, "admin");

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
  await page
    .getByRole("button", { name: scheme === "dark" ? "Dark" : "Light", exact: true })
    .click();
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
        // sites offers resized copies, where the canvas shows the original. The renderers
        // are compared, not the resizing, so both show the original.
        image.removeAttribute("srcset");
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

const open = async (page: Page, site: (typeof sites)[number]) => {
  await page.goto(`${sitesUrl.protocol}//${site.host(sitesUrl.host)}${fixturesPath}`);
  await page.evaluate(() =>
    Promise.all(
      Array.from(document.images, (image) => {
        image.loading = "eager";
        return image.decode().catch(() => undefined);
      }),
    ),
  );
};

for (const scheme of ["light", "dark"] as const) {
  test(`every block fixture matches its baseline in ${scheme}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      colorScheme: scheme,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const taken = new Set<string>();
    for (const site of sites) {
      await open(page, site);
      const sections = page.locator("body > main > *");
      for (const [index, { fixture, item }] of site.fixtures.entries()) {
        const name = `${fixture.type}-v${fixture.version}-${fixture.name}-${scheme}`;
        // Each generation's sites share a header or footer fixture; one baseline covers it.
        if (taken.has(name)) continue;
        taken.add(name);
        const part =
          index === 0
            ? page.locator("body > header")
            : index === site.fixtures.length - 1
              ? page.locator("body > footer")
              : sections.nth(index - 1);
        await expect(item ? part.locator("li").first() : part).toHaveScreenshot(`${name}.png`, {
          animations: "disabled",
        });
      }
    }
    await context.close();
  });
}

test("a preview's forms don't submit", async ({ browser }) => {
  const meera = await asAdmin(browser);
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
    const meera = await asAdmin(browser);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      colorScheme: scheme,
    });
    const published = await context.newPage();
    const shown = await context.newPage();
    for (const site of sites) {
      const draft = await newDraft(meera, site.site.id, `Preview parity ${scheme}`);
      // The preview needs the draft's sharing to open in another context, so it opens signed in.
      await shown.context().addCookies(await meera.context().cookies(studioUrl));
      await shown.goto(previewOf(site.site.id, draft));
      await published.goto(fixturesUrl(site));
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
