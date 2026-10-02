import { afterEach, beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { commands, page } from "vitest/browser";

import { ThemeToggle } from "@/components/theme-toggle";
import { themeScript } from "@/lib/theme";

declare module "vitest/browser" {
  interface BrowserCommands {
    emulateColorScheme: (scheme: "light" | "dark") => Promise<void>;
  }
}

const dark = () => document.documentElement.classList.contains("dark");

/** Loads Studio's page again: its head script runs before anything renders. */
const loadPage = () => {
  document.documentElement.classList.remove("dark");
  const script = document.createElement("script");
  script.textContent = themeScript;
  document.head.appendChild(script);
  script.remove();
};

const choice = (name: string) => page.getByRole("button", { name, exact: true });

beforeEach(async () => {
  localStorage.clear();
  await commands.emulateColorScheme("light");
});

afterEach(() => document.documentElement.classList.remove("dark"));

test("Studio follows the system's color scheme as it changes, until someone chooses one", async () => {
  await commands.emulateColorScheme("dark");
  loadPage();
  expect(dark()).toBe(true);
  await render(<ThemeToggle />);
  await expect.element(choice("System")).toHaveAttribute("aria-pressed", "true");

  await commands.emulateColorScheme("light");
  await expect.poll(dark).toBe(false);
  await commands.emulateColorScheme("dark");
  await expect.poll(dark).toBe(true);
});

test("a chosen scheme wins over the system's, now and from the start of the next visit", async () => {
  await commands.emulateColorScheme("dark");
  loadPage();
  const first = await render(<ThemeToggle />);
  await choice("Light").click();
  expect(dark()).toBe(false);
  await first.unmount();
  loadPage();
  expect(dark()).toBe(false);

  await commands.emulateColorScheme("light");
  const second = await render(<ThemeToggle />);
  await expect.element(choice("Light")).toHaveAttribute("aria-pressed", "true");
  await choice("Dark").click();
  expect(dark()).toBe(true);
  await second.unmount();
  loadPage();
  expect(dark()).toBe(true);
});

test("choosing System again hands the scheme back to the system", async () => {
  await render(<ThemeToggle />);
  await choice("Dark").click();
  expect(dark()).toBe(true);

  await choice("System").click();
  expect(dark()).toBe(false);
  loadPage();
  expect(dark()).toBe(false);
});
