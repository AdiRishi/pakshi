import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { fixture, serverRendered, show } from "./support.tsx";

// Sending posts the page away, so the browser's submit stands in for the post.
const sends = () => vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});

afterEach(() => {
  vi.restoreAllMocks();
});

test("a required question left empty says so once the visitor leaves it", async () => {
  const screen = await show(fixture("form-section", "split"));
  await userEvent.click(screen.getByLabelText("Your name"));
  await expect.element(screen.getByText("Answer this question")).not.toBeInTheDocument();
  await userEvent.tab();
  await expect.element(screen.getByText("Answer this question")).toBeVisible();
  await expect.element(screen.getByLabelText("Your name")).toHaveAttribute("aria-invalid", "true");
});

test("an email address that isn't one says so", async () => {
  const screen = await show(fixture("form-section", "split"));
  await userEvent.type(screen.getByLabelText("Email"), "sam@");
  await userEvent.tab();
  await expect.element(screen.getByText("Enter an email address")).toBeVisible();
});

test("sending with problems moves focus to the first one and sends nothing", async () => {
  const submit = sends();
  const screen = await show(fixture("form-section", "split"));
  await userEvent.type(screen.getByLabelText("Your name"), "Sam Okafor");
  await userEvent.click(screen.getByRole("button", { name: "Register" }));
  await expect.element(screen.getByLabelText("Email")).toHaveFocus();
  await expect.element(screen.getByText("Tick this box to send the form")).toBeVisible();
  expect(submit).not.toHaveBeenCalled();
});

test("a form with every answer in order sends", async () => {
  const submit = sends();
  const screen = await show(fixture("form-section", "split"));
  await userEvent.type(screen.getByLabelText("Your name"), "Sam Okafor");
  await userEvent.type(screen.getByLabelText("Email"), "sam@example.org");
  await userEvent.selectOptions(screen.getByLabelText("Which week?"), "First week of July");
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Register" }));
  await expect.poll(() => submit.mock.calls.length).toBe(1);
});

test("a form in a preview can't be sent", async () => {
  const submit = sends();
  const screen = await show(fixture("form-section", "inline"), {
    preview: { changed: new Set() },
  });
  await expect.element(screen.getByRole("button", { name: "Sign up" })).toBeDisabled();
  await userEvent.type(screen.getByLabelText("Email address"), "sam@example.org{Enter}");
  expect(submit).not.toHaveBeenCalled();
});

test("answers given before the page hydrates are kept and sent", async () => {
  const submit = sends();
  const server = await serverRendered(fixture("form-section", "split"));
  await userEvent.type(page.getByLabelText("Your name"), "Sam Okafor");
  await userEvent.type(page.getByLabelText("Email"), "sam@example.org");
  await userEvent.selectOptions(page.getByLabelText("Which week?"), "First week of July");
  await userEvent.click(page.getByRole("checkbox"));
  server.hydrate();
  await expect.poll(() => document.querySelector("form")?.noValidate).toBe(true);
  await expect.element(page.getByLabelText("Your name")).toHaveValue("Sam Okafor");
  await userEvent.click(page.getByRole("button", { name: "Register" }));
  await expect.poll(() => submit.mock.calls.length).toBe(1);
});
