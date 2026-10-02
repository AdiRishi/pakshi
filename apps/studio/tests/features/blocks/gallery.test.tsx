import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { renderGallery } from "./harness";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const cardNames = () =>
  Array.from(document.querySelectorAll("ul h2"), (heading) => heading.textContent);

const search = () => page.getByRole("searchbox", { name: "Search blocks" });

test("search keeps the blocks whose name or summary holds the words, and says when none do", async () => {
  const onAsk = vi.fn<() => void>();
  await renderGallery({ onAsk });
  expect(cardNames()).toHaveLength(20);

  await userEvent.fill(search(), "Photo ");
  expect(cardNames()).toEqual(["Image and text", "Image", "Gallery"]);

  await userEvent.fill(search(), "countdown");
  await expect.element(page.getByText('No block matches "countdown"')).toBeVisible();
  await page.getByRole("button", { name: "Ask for a new block" }).last().click();
  expect(onAsk).toHaveBeenCalled();

  await page.getByRole("button", { name: "Clear the search" }).click();
  expect(cardNames()).toHaveLength(20);
});

test("only someone with updates to see has an Updates tab, even at its address", async () => {
  await renderGallery({ path: "/blocks?tab=updates" });
  await expect
    .element(page.getByRole("tab", { name: "All blocks" }))
    .toHaveAttribute("aria-selected", "true");
  expect(page.getByRole("tab", { name: "Updates" }).query()).toBeNull();
});

test("the platform team's Updates tab opens at its address", async () => {
  await renderGallery({ path: "/blocks?tab=updates", updates: <p>Hero is behind</p> });
  await expect
    .element(page.getByRole("tab", { name: "Updates" }))
    .toHaveAttribute("aria-selected", "true");
  await expect.element(page.getByText("Hero is behind")).toBeVisible();
});

/** The index of the layout the hero card's preview shows, once its frame has rendered. */
const shownLayout = () => {
  const layers = document
    .querySelector("iframe")
    ?.contentDocument?.querySelectorAll(".pakshi-layer");
  return layers === undefined || layers.length === 0
    ? null
    : Array.from(layers).findIndex((layer) => layer.hasAttribute("data-shown"));
};

/** Points at the hero card and lets one layout's turn pass. */
const pointAtHeroForATurn = async () => {
  await page.viewport(1280, 900);
  await renderGallery({});
  await userEvent.fill(search(), "big opening");
  await expect.poll(shownLayout).toBe(0);
  // The pointer may still rest where an earlier test left it, over the card.
  await userEvent.hover(page.getByRole("heading", { name: "Blocks", level: 1 }));
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  await userEvent.hover(page.getByRole("link", { name: /Hero/ }));
  vi.advanceTimersByTime(4000);
  vi.useRealTimers();
};

test("pointing at a card fades its preview to the block's next layout", async () => {
  await pointAtHeroForATurn();
  await expect.poll(shownLayout).toBe(1);
});

/** A system setting that asks for less motion, which never changes. */
class LessMotion extends EventTarget implements MediaQueryList {
  readonly matches = true;
  readonly media: string;
  onchange = null;
  constructor(media: string) {
    super();
    this.media = media;
  }
  addListener() {}
  removeListener() {}
}

test("a card keeps its first layout for someone who asked for less motion", async () => {
  const matchMedia = window.matchMedia.bind(window);
  vi.spyOn(window, "matchMedia").mockImplementation((query) =>
    query === "(prefers-reduced-motion: reduce)" ? new LessMotion(query) : matchMedia(query),
  );
  await pointAtHeroForATurn();
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(shownLayout()).toBe(0);
});
