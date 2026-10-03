import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";

import { fixture, show } from "./support.tsx";

test("the sign-up form points out a mistyped email and focuses it instead of sending", async () => {
  const screen = await show(fixture("footer", "columns"));
  const email = screen.getByRole("textbox", { name: "Email address" });
  await userEvent.fill(email, "ada@");
  await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
  await expect.element(screen.getByText("Enter an email address")).toBeVisible();
  await expect.element(email).toHaveAttribute("aria-invalid", "true");
  await expect.element(email).toHaveFocus();
});
