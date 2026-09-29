import AxeBuilder from "@axe-core/playwright";
import {
  type Browser,
  expect,
  type FrameLocator,
  type Locator,
  type Page,
  test,
} from "@playwright/test";

const studioUrl = process.env.STUDIO_URL ?? "";
const homePage = `${studioUrl}/sites/site_harbour/pages/pg_home`;

/** Someone signed in to Studio in their own browser, with the sample site's home page open. */
const editing = async (browser: Browser, name: string) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(studioUrl);
  await page.getByRole("link", { name: /^Continue with .* account$/ }).click();
  await page.getByRole("button", { name }).click();
  await expect(page.getByRole("heading", { name: `Hello, ${name.split(" ")[0]}` })).toBeVisible();
  await page.goto(homePage);
  const canvas = page.frameLocator("iframe[title^='Canvas']");
  await expect(canvas.locator("[data-pakshi-block]").first()).toBeVisible();
  return { page, canvas };
};

const fieldIn = (canvas: FrameLocator, block: string, field: string) =>
  canvas.locator(`[data-pakshi-block="${block}"] [data-pakshi-field="${field}"]`);

/** Puts the caret after a field's last character. */
const caretAtEnd = (field: Locator) =>
  field.evaluate((element) => {
    element.focus();
    const selection = element.ownerDocument.getSelection();
    selection?.selectAllChildren(element);
    selection?.collapseToEnd();
  });

const saved = (page: Page) => expect(page.getByText("Saved to the draft")).toBeVisible();

/** Ends the person's typing, as moving on to something else does. */
const stopTyping = (page: Page) => page.getByRole("button", { name: "Page settings" }).click();

test("two people edit one draft live, and every change is applied or its author is told", async ({
  browser,
}) => {
  const meera = await editing(browser, "Meera Kapoor");
  const sam = await editing(browser, "Sam Okafor");

  // Each sees the other.
  await expect(
    meera.page.getByRole("list", { name: "Also editing this draft" }).getByText(/Sam Okafor/),
  ).toBeAttached();
  await expect(
    sam.page.getByRole("list", { name: "Also editing this draft" }).getByText(/Meera Kapoor/),
  ).toBeAttached();

  // Who else is here meets the same accessibility bar as the rest of the editor screen.
  const results = await new AxeBuilder({ page: meera.page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .exclude("iframe[title^='Canvas']")
    .analyze();
  expect(results.violations).toEqual([]);

  // A change appears for the other person as it's typed, with who is typing where.
  const registerHeading = (canvas: FrameLocator) => fieldIn(canvas, "b_register", "heading");
  const heading = (await registerHeading(meera.canvas).textContent()) ?? "";
  await caretAtEnd(registerHeading(meera.canvas));
  await meera.page.keyboard.type(" soon");
  await expect(
    sam.canvas.locator(".pakshi-presence", { hasText: "Meera is typing" }),
  ).toBeVisible();
  await expect(registerHeading(sam.canvas)).toHaveText(`${heading} soon`);

  // Both type in one field at once. The later write wins; the other person is told.
  const aboutHeading = (canvas: FrameLocator) => fieldIn(canvas, "b_about", "heading");
  const about = (await aboutHeading(meera.canvas).textContent()) ?? "";
  await caretAtEnd(aboutHeading(meera.canvas));
  await caretAtEnd(aboutHeading(sam.canvas));
  await Promise.all([meera.page.keyboard.type(" together"), sam.page.keyboard.type(" here")]);
  await Promise.all([stopTyping(meera.page), stopTyping(sam.page)]);
  await Promise.all([saved(meera.page), saved(sam.page)]);
  const final = (await aboutHeading(meera.canvas).textContent()) ?? "";
  await expect(aboutHeading(sam.canvas)).toHaveText(final);
  for (const [person, typed, other] of [
    [meera, `${about} together`, "Sam Okafor"],
    [sam, `${about} here`, "Meera Kapoor"],
  ] as const)
    if (final !== typed)
      await expect(person.page.getByText(`${other} replaced your change.`)).toBeVisible();

  // Undo reverses only what's still the person's own.
  const registerBody = (canvas: FrameLocator) => fieldIn(canvas, "b_register", "body");
  const body = (await registerBody(meera.canvas).textContent()) ?? "";
  await caretAtEnd(registerBody(meera.canvas));
  await meera.page.keyboard.type(" Apply early.");
  await stopTyping(meera.page);
  await expect(registerBody(sam.canvas)).toHaveText(`${body} Apply early.`);
  await caretAtEnd(registerBody(sam.canvas));
  await sam.page.keyboard.type(" Really.");
  await stopTyping(sam.page);
  await expect(registerBody(meera.canvas)).toHaveText(`${body} Apply early. Really.`);
  await meera.page.getByRole("button", { name: "Undo" }).click();
  await expect(meera.page.getByText("Some of that couldn't be undone.")).toBeVisible();
  await Promise.all([saved(meera.page), saved(sam.page)]);
  await expect(registerBody(meera.canvas)).toHaveText(`${body} Apply early. Really.`);
  await expect(registerBody(sam.canvas)).toHaveText(`${body} Apply early. Really.`);

  // Someone removes the section another person is typing in. The typing is lost, and its author told.
  await caretAtEnd(aboutHeading(meera.canvas));
  await meera.page.keyboard.type(" and more");
  const outlineRow = sam.page.locator('[data-pakshi-outline-block="b_about"]');
  await outlineRow.focus();
  await sam.page.keyboard.press("Delete");
  await expect(sam.canvas.locator('[data-pakshi-block="b_about"]')).toHaveCount(0);
  await expect(meera.canvas.locator('[data-pakshi-block="b_about"]')).toHaveCount(0);
  // Whether her last keystrokes were still on their way decides which she's told.
  await expect(
    meera.page
      .getByText("Sam Okafor removed the block you had selected.")
      .or(meera.page.getByText("Sam Okafor removed what it changed.")),
  ).toBeVisible();

  // Both end showing the same page, with nothing left to save.
  await Promise.all([saved(meera.page), saved(sam.page)]);
  const pageText = (canvas: FrameLocator) => canvas.locator("main").innerText();
  expect(await pageText(meera.canvas)).toBe(await pageText(sam.canvas));

  // Put the sample page back for the tests that follow.
  await sam.page.getByRole("button", { name: "Undo" }).click();
  await expect(meera.canvas.locator('[data-pakshi-block="b_about"]')).toHaveCount(1);
  await saved(sam.page);
});
