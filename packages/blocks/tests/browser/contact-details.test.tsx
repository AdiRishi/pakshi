import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { fixture, show } from "./support.tsx";

/** The system clipboard, which a test browser may not write to, as a value the test can read. */
const clipboard = () => {
  const held = { text: "" };
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    held.text = text;
  });
  return held;
};

afterEach(() => {
  vi.restoreAllMocks();
});

test("the copy button beside an email address copies it and says so", async () => {
  const held = clipboard();
  const screen = await show(fixture("contact-details", "columns"));
  await userEvent.click(screen.getByRole("button", { name: "Copy email address" }));
  await expect
    .element(screen.getByRole("status").filter({ hasText: "Copied" }))
    .toBeInTheDocument();
  expect(held.text).toBe("hello@example.org");
});

test("a phone number is copied as it's written", async () => {
  const held = clipboard();
  const screen = await show(fixture("contact-details", "split"));
  await userEvent.click(screen.getByRole("button", { name: "Copy phone number" }));
  await expect.poll(() => held.text).toBe("01632 960432");
});
