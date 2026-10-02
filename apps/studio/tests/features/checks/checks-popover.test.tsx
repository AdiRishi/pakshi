import type { PersonOnly } from "@repo/agent/issues";
import { BlockId, PageId } from "@repo/contracts/ids";
import type { CheckIssue } from "@repo/contracts/publishing";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { ChecksPopover, type PakshiReadiness } from "@/features/checks/checks-popover";

const home = { target: PageId.make("pg_home"), title: "Home" };

const noDescription: CheckIssue = { _tag: "MissingMeta", place: home, field: "description" };
const heading: CheckIssue = {
  _tag: "Placeholder",
  place: home,
  block: { id: BlockId.make("b_hero"), title: "Hero" },
  path: ["heading"],
  field: "Heading",
};
const photo: CheckIssue = {
  _tag: "Placeholder",
  place: home,
  block: { id: BlockId.make("b_hero"), title: "Hero" },
  path: ["image"],
  field: "Image",
};

const altText: CheckIssue = {
  _tag: "Incomplete",
  place: home,
  block: { id: BlockId.make("b_split"), title: "Image and text" },
  path: ["image", "alt"],
  field: "Image",
  message: "Fill this in",
};

const yours: ReadonlyMap<CheckIssue, PersonOnly> = new Map<CheckIssue, PersonOnly>([
  [photo, "image"],
  [altText, "alt-text"],
]);

const renderChecks = async (
  options: {
    readonly issues?: ReadonlyArray<CheckIssue>;
    readonly pakshi?: PakshiReadiness;
    readonly goTo?: (issue: CheckIssue) => (() => void) | null;
    readonly onFixAll?: (message: string) => void;
  } = {},
) => {
  const issues = options.issues ?? [heading, photo, noDescription];
  await render(
    <ChecksPopover
      issues={issues}
      personOnly={(issue) => yours.get(issue) ?? null}
      goTo={options.goTo ?? (() => null)}
      pakshi={options.pakshi ?? "ready"}
      onFixAll={options.onFixAll ?? (() => undefined)}
    />,
  );
  await page.getByRole("button", { name: `${issues.length} things to fix` }).click();
  return page.getByRole("dialog", { name: `${issues.length} things to fix` });
};

test("lists every check, and marks what only the person can fix", async () => {
  const checks = await renderChecks();
  await expect.element(checks.getByText("No broken links")).toBeVisible();
  await expect
    .element(checks.getByRole("button", { name: /Image in Hero, Home, still has placeholder/ }))
    .toMatchTextContent(/Needs you\s*Pakshi can't choose images\./);
  await expect
    .element(checks.getByRole("button", { name: /Heading in Hero, Home/ }))
    .not.toMatchTextContent("Needs you");
});

test("choosing an issue closes the checks and goes to it", async () => {
  const go = vi.fn<() => void>();
  const checks = await renderChecks({ goTo: (issue) => (issue === noDescription ? go : null) });
  await checks.getByRole("button", { name: /Home has no description/ }).click();
  expect(go).toHaveBeenCalledOnce();
  await expect.element(checks).not.toBeInTheDocument();
});

test("Fix all asks Pakshi, in the person's words, to fix what it can", async () => {
  const onFixAll = vi.fn<(message: string) => void>();
  const checks = await renderChecks({ onFixAll });
  await expect
    .element(checks.getByText("Pakshi works through the 2 it can in the chat", { exact: false }))
    .toBeVisible();
  await checks.getByRole("button", { name: "Fix all with Pakshi" }).click();
  expect(onFixAll).toHaveBeenCalledWith(
    [
      "Fix everything the checks found that you can:",
      "- Heading in Hero, Home, still has placeholder content",
      "- Home has no description",
    ].join("\n"),
  );
});

test("Fix all says why it waits while Pakshi is busy", async () => {
  const checks = await renderChecks({ pakshi: "working" });
  const fixAll = checks.getByRole("button", { name: "Fix all with Pakshi" });
  await expect.element(fixAll).toBeDisabled();
  await expect
    .element(fixAll)
    .toHaveAccessibleDescription(
      "Pakshi is still working on your last request. Wait for it to finish, or stop it in the chat.",
    );
});

test("Fix all has nothing to do when what's left needs the person", async () => {
  const checks = await renderChecks({ issues: [photo, altText] });
  const fixAll = checks.getByRole("button", { name: "Fix all with Pakshi" });
  await expect.element(fixAll).toBeDisabled();
  await expect
    .element(fixAll)
    .toHaveAccessibleDescription(
      "What's left needs you, so there's nothing here for Pakshi to fix.",
    );
});
