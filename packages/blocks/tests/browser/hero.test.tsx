import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { fixture, show } from "./support.tsx";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Records what a form sends, in place of the browser leaving the page to send it. */
const recordSends = () => {
  const sent: Array<FormData> = [];
  vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function (
    this: HTMLFormElement,
  ) {
    sent.push(new FormData(this));
  });
  return sent;
};

test("the sign-up form points out a mistyped email and keeps focus on it instead of sending", async () => {
  const sent = recordSends();
  const screen = await show(fixture("hero", "phone"));
  const email = screen.getByRole("textbox", { name: "Email address" });
  await userEvent.fill(email, "sam.example.org");
  await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
  await expect.element(screen.getByRole("alert")).toBeVisible();
  await expect.element(email).toHaveAttribute("aria-invalid", "true");
  await expect.element(email).toHaveFocus();
  expect(sent).toEqual([]);
});

test("the sign-up form sends a good email with the form's hidden answers", async () => {
  const sent = recordSends();
  const screen = await show(fixture("hero", "phone"));
  await userEvent.fill(screen.getByRole("textbox", { name: "Email address" }), "sam@example.org");
  await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
  await vi.waitFor(() => expect(sent).toHaveLength(1));
  expect(Object.fromEntries(sent[0] ?? [])).toEqual({
    ff_email: "sam@example.org",
    ff_source: "footer",
  });
  expect(screen.getByRole("alert").query()).toBeNull();
});
