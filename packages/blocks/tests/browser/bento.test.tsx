import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";

import { fixture, show } from "./support.tsx";

afterEach(async () => {
  await page.viewport(414, 896);
});

test("on a wide screen, a tile's link waits under its words and shows when the keyboard reaches it", async () => {
  await page.viewport(1280, 900);
  const screen = await show(fixture("bento", "showcase"), { motion: true });
  const link = screen.getByRole("link", { name: "Book a place" });
  await expect.poll(() => getComputedStyle(link.element()).opacity).toBe("0");
  await userEvent.tab();
  await expect.element(link).toHaveFocus();
  await expect.poll(() => getComputedStyle(link.element()).opacity).toBe("1");
});

test("clicking anywhere on a tile with a link opens it", async () => {
  await page.viewport(1280, 900);
  const screen = await show(fixture("bento", "grid"), { motion: true });
  const link = screen.getByRole("link", { name: "Directions" }).element();
  const tile = link.closest("li");
  if (tile === null) throw new Error("The link isn't in a tile.");
  tile.scrollIntoView({ block: "center" });
  const box = tile.getBoundingClientRect();
  for (const corner of [
    { x: box.left + 12, y: box.top + 12 },
    { x: box.right - 12, y: box.bottom - 12 },
  ])
    expect(document.elementFromPoint(corner.x, corner.y)?.closest("a")).toBe(link);
});
