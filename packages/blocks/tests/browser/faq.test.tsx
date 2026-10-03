import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";

import { fixture, show } from "./support.tsx";

const bring = { name: "What should my child bring?" };
const swim = { name: "Do they need to be able to swim?" };
const swimAnswer = /must be able to swim 25 metres/;

test("the first answer shows, and a question opens to show its answer and closes again", async () => {
  const screen = await show(fixture("faq", "accordion"));
  await expect.element(screen.getByText(/Old clothes, sturdy shoes/)).toBeVisible();
  const question = screen.getByRole("button", swim);
  await expect.element(question).toHaveAttribute("aria-expanded", "false");
  await expect.element(screen.getByText(swimAnswer)).not.toBeVisible();

  await userEvent.click(question);
  await expect.element(question).toHaveAttribute("aria-expanded", "true");
  await expect.element(screen.getByText(swimAnswer)).toBeVisible();

  await userEvent.click(question);
  await expect.element(question).toHaveAttribute("aria-expanded", "false");
  await expect.element(screen.getByText(swimAnswer)).not.toBeVisible();
});

test("opening a question leaves the others open", async () => {
  const screen = await show(fixture("faq", "accordion"));
  await userEvent.click(screen.getByRole("button", swim));
  await expect.element(screen.getByRole("button", swim)).toHaveAttribute("aria-expanded", "true");
  await expect.element(screen.getByRole("button", bring)).toHaveAttribute("aria-expanded", "true");
});

test("the keyboard reaches each question and opens it", async () => {
  const screen = await show(fixture("faq", "accordion"));
  screen.getByRole("button", bring).element().focus();
  await userEvent.tab();
  const question = screen.getByRole("button", swim);
  await expect.element(question).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.element(question).toHaveAttribute("aria-expanded", "true");
  await expect.element(screen.getByText(swimAnswer)).toBeVisible();
  await userEvent.keyboard(" ");
  await expect.element(question).toHaveAttribute("aria-expanded", "false");
});
