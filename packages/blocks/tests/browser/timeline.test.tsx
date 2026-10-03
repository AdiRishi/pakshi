import { beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";

import { fixture, show } from "./support.tsx";

// On a phone's width the timeline shows one entry at a time.
beforeEach(async () => {
  await page.viewport(414, 896);
});

const whole = { ratio: 1 };

test("the later and earlier buttons move the timeline an entry at a time", async () => {
  const screen = await show(fixture("timeline", "horizontal"));
  const first = screen.getByRole("heading", { name: "Applications open" });
  const second = screen.getByRole("heading", { name: "Bursary decisions" });
  const later = screen.getByRole("button", { name: "Later" });
  later.element().scrollIntoView({ block: "end" });
  await expect.element(first).toBeInViewport(whole);
  await expect.element(second).not.toBeInViewport(whole);

  await userEvent.click(later);
  await expect.element(second).toBeInViewport(whole);
  await expect.element(first).not.toBeInViewport();

  await userEvent.click(screen.getByRole("button", { name: "Earlier" }));
  await expect.element(first).toBeInViewport(whole);
});

test("the keyboard reaches the timeline's buttons, and the arrow keys move it", async () => {
  const screen = await show(fixture("timeline", "horizontal"));
  const third = screen.getByRole("heading", { name: "Places confirmed" });
  screen.getByRole("link", { name: "Apply now" }).element().focus();
  await userEvent.tab();
  const later = screen.getByRole("button", { name: "Later" });
  await expect.element(later).toHaveFocus();
  later.element().scrollIntoView({ block: "end" });

  await userEvent.keyboard("{ArrowRight}{ArrowRight}");
  await expect.element(third).toBeInViewport(whole);
  await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
  await expect
    .element(screen.getByRole("heading", { name: "Applications open" }))
    .toBeInViewport(whole);
});
