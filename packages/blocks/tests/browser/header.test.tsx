import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";

import { fixture, show } from "./support.tsx";

afterEach(async () => {
  await page.viewport(414, 896);
});

test("on a wide screen, a menu item opens a panel whose links the keyboard reaches", async () => {
  await page.viewport(1280, 800);
  const screen = await show(fixture("header", "standard"));
  const programme = screen.getByRole("button", { name: "Programme" });
  programme.element().focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(programme).toHaveAttribute("aria-expanded", "true");
  await userEvent.tab();
  await expect.element(page.getByRole("link", { name: "Programme" })).toHaveFocus();
  await userEvent.tab();
  await expect.element(page.getByRole("link", { name: "Workshops" })).toHaveFocus();
});

test("on a phone, the menu opens as a dialog of every link and closes on Escape", async () => {
  await page.viewport(390, 844);
  const screen = await show(fixture("header", "standard"));
  const menu = screen.getByRole("button", { name: "Menu" });
  await userEvent.click(menu);
  const dialog = page.getByRole("dialog", { name: "Menu" });
  await expect.element(dialog.getByRole("link", { name: "News" })).toBeVisible();
  await expect.element(dialog.getByRole("link", { name: "Workshops" })).toBeVisible();
  await expect.element(dialog.getByRole("link", { name: "Register" })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(menu).toHaveFocus();
});
