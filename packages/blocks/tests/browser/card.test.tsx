import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";

import { fixture, show } from "./support.tsx";

test("the keyboard reaches each card's page in turn, and the card shows where focus is", async () => {
  const screen = await show(fixture("cards", "grid"));
  screen.getByRole("link", { name: "See the programme" }).element().focus();
  for (const title of ["Getting here", "What happens each day", "Meet the mentors"]) {
    await userEvent.tab();
    const link = screen.getByRole("link", { name: title });
    await expect.element(link).toHaveFocus();
    const card = link.element().closest("li");
    expect(card === null ? "none" : getComputedStyle(card).outlineStyle).toBe("solid");
  }
});

test.each(["grid", "overlay-landscape", "tiles", "list", "list-tiles"])(
  "clicking anywhere on a card in the %s layout opens its page",
  async (name) => {
    const screen = await show(fixture("cards", name));
    const cards = screen.getByRole("listitem").elements();
    expect(cards.length).toBeGreaterThan(1);
    for (const card of cards) {
      card.scrollIntoView({ block: "center" });
      const box = card.getBoundingClientRect();
      const link = card.querySelector("a");
      for (const corner of [
        { x: box.left + 12, y: box.top + 12 },
        { x: box.right - 12, y: box.bottom - 12 },
      ])
        expect(document.elementFromPoint(corner.x, corner.y)?.closest("a")).toBe(link);
    }
  },
);
