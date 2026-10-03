import { beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";

import { fixture, show } from "./support.tsx";

const mei = { name: "Mei Chen in the boatshed" };

// On a phone's width the lightbox shows one photo across the whole screen.
beforeEach(async () => {
  await page.viewport(414, 896);
});

test("opening a photo shows it large in a lightbox", async () => {
  const screen = await show(fixture("gallery", "grid"));
  await userEvent.click(screen.getByRole("button", { name: /Mei Chen/ }));
  const lightbox = page.getByRole("dialog");
  await expect.element(lightbox).toBeVisible();
  await expect.element(lightbox.getByRole("img", mei)).toBeInViewport();
  await expect
    .element(lightbox.getByRole("img", { name: "Two dinghies sailing past the harbour wall" }))
    .not.toBeInViewport();
});

test("the next button and the right arrow key move to the next photo", async () => {
  const screen = await show(fixture("gallery", "masonry"));
  await userEvent.click(screen.getByRole("button", { name: /Mei Chen/ }));
  const lightbox = page.getByRole("dialog");
  const map = lightbox.getByRole("img", { name: /A map of North Quay/ });
  await userEvent.click(lightbox.getByRole("button", { name: "Next photo" }));
  await expect.element(map).toBeInViewport();
  await expect.element(lightbox.getByRole("img", mei)).not.toBeInViewport();

  await userEvent.keyboard("{ArrowRight}");
  await expect.element(map).not.toBeInViewport();
  await expect.element(lightbox.getByRole("img", { name: /Tom Penrose/ })).toBeInViewport();
  await userEvent.keyboard("{ArrowLeft}");
  await expect.element(map).toBeInViewport();
});

test("the keyboard opens a photo, and Escape closes it with focus back on the photo", async () => {
  const screen = await show(fixture("gallery", "mosaic"));
  const opener = screen.getByRole("button", { name: /Two dinghies on the water/ });
  opener.element().focus();
  await userEvent.keyboard("{Enter}");
  const lightbox = page.getByRole("dialog");
  await expect
    .element(lightbox.getByRole("img", { name: "Two dinghies on the water" }))
    .toBeInViewport();
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(lightbox.getByRole("img", { name: /Dan Okafor/ })).toBeInViewport();

  await userEvent.keyboard("{Escape}");
  await expect.element(lightbox).not.toBeInTheDocument();
  await expect.element(opener).toHaveFocus();
});
