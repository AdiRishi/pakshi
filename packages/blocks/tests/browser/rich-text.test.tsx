import { beforeEach, expect, onTestFinished, test } from "vitest";
import { page } from "vitest/browser";

import { fixture, show } from "./support.tsx";

// The rail runs beside the article where a wide screen leaves room for it.
beforeEach(async () => {
  await page.viewport(1280, 800);
});

/** Room above and below the block, so it can scroll past the middle of the window. */
const room = () => {
  const above = document.createElement("div");
  const below = document.createElement("div");
  above.style.height = "100vh";
  below.style.height = "100vh";
  document.body.prepend(above);
  document.body.append(below);
  onTestFinished(() => {
    above.remove();
    below.remove();
    window.scrollTo(0, 0);
  });
};

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

test("the rail beside an article fills as the article is read, level with the middle of the window", async () => {
  const screen = await show(fixture("rich-text", "article"));
  room();
  const rail = screen.container.querySelector("[data-slot=scroll-progress]");
  const fill = rail?.firstElementChild;
  if (rail === null || fill === null || fill === undefined) throw new Error("No rail is drawn.");
  const filled = () => fill.getBoundingClientRect().height;
  await frame();
  expect(filled()).toBe(0);

  const box = rail.getBoundingClientRect();
  window.scrollBy(0, box.top + box.height / 2 - window.innerHeight / 2);
  await expect
    .poll(() => fill.getBoundingClientRect().bottom)
    .toBeCloseTo(window.innerHeight / 2, 0);

  window.scrollBy(0, box.height);
  await expect.poll(filled).toBeCloseTo(rail.getBoundingClientRect().height, 0);
});

test("with the theme's motion off, an article has no rail", async () => {
  const screen = await show(fixture("rich-text", "article"), { motion: false });
  await expect.element(screen.getByText(/Each day starts at eight/)).toBeVisible();
  expect(screen.container.querySelector("[data-slot=scroll-progress]")).toBeNull();
});
