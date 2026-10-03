import { beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";

import { fixture, show } from "./support.tsx";

// On a phone's width the carousel shows one testimonial, with the next peeking in.
beforeEach(async () => {
  await page.viewport(414, 896);
});

const whole = { ratio: 1 };

test("the next and previous buttons move through the testimonials", async () => {
  const screen = await show(fixture("testimonials", "scroller"));
  const priya = screen.getByText("Priya Shah");
  const dan = screen.getByText("Dan Okafor");
  const previous = screen.getByRole("button", { name: "Previous testimonials" });
  await expect.element(priya).toBeInViewport(whole);
  await expect.element(dan).not.toBeInViewport(whole);
  await expect.element(previous).toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "Next testimonials" }));
  await expect.element(dan).toBeInViewport(whole);
  await expect.element(priya).not.toBeInViewport(whole);

  await userEvent.click(previous);
  await expect.element(priya).toBeInViewport(whole);
});

test("the arrow keys move through the testimonials once the carousel has focus", async () => {
  const screen = await show(fixture("testimonials", "scroller"));
  screen.getByRole("button", { name: "Next testimonials" }).element().focus();
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(screen.getByText("Dan Okafor")).toBeInViewport(whole);
  await userEvent.keyboard("{ArrowLeft}");
  await expect.element(screen.getByText("Priya Shah")).toBeInViewport(whole);
});
