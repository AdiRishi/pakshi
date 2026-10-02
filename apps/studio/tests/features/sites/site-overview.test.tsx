import { DraftId } from "@repo/contracts/ids";
import { expect, test } from "vitest";
import { page } from "vitest/browser";

import { published, renderOverview, site, unpublished } from "./harness";

test("a site that was never published says so, with nothing to visit", async () => {
  await renderOverview(unpublished);
  await expect.element(page.getByText("Not published yet")).toBeVisible();
  await expect
    .element(
      page.getByText(
        "Visitors will find it at harbour.pakshi.test once its first draft is published.",
      ),
    )
    .toBeVisible();
  expect(page.getByRole("link", { name: /Visit site/ }).query()).toBeNull();
  expect(document.querySelector("iframe")).toBeNull();
});

test("a live site opens at its own domain first, and names its Pakshi address too", async () => {
  await renderOverview({
    ...published,
    addresses: { own: "https://www.harbourschools.org", pakshi: "https://harbour.pakshi.test" },
  });
  const visit = page.getByRole("link", { name: /Visit site/ });
  await expect.element(visit).toHaveAttribute("href", "https://www.harbourschools.org");
  await expect.element(visit).toHaveAttribute("target", "_blank");
  await expect.element(page.getByText("www.harbourschools.org", { exact: true })).toBeVisible();
  await expect.element(page.getByText("Also at harbour.pakshi.test")).toBeVisible();
  await expect
    .element(page.getByRole("link", { name: "Published 2 hours ago by Meera Kapoor" }))
    .toHaveAttribute("href", `/sites/${site}/releases`);
});

test("each count links to the tab it counts in, and a count of none says so", async () => {
  await renderOverview({
    ...published,
    editing: { openDrafts: 3, waitingDrafts: 2, blockUpdates: 1, brandUpdate: null },
    newEntries: 0,
  });
  await expect
    .element(page.getByRole("link", { name: "2 drafts waiting for approval" }))
    .toHaveAttribute("href", `/sites/${site}`);
  await expect
    .element(page.getByRole("link", { name: "No new submissions in the last 7 days" }))
    .toHaveAttribute("href", `/sites/${site}/submissions`);
  await expect
    .element(page.getByRole("link", { name: "1 update available" }))
    .toHaveAttribute("href", `/sites/${site}/blocks`);
});

test("a brand update alone is opened straight from its count", async () => {
  const brandUpdate = { id: DraftId.make("dr_brand"), name: "Brand update" };
  await renderOverview({
    ...published,
    editing: { openDrafts: 1, waitingDrafts: 0, blockUpdates: 0, brandUpdate },
  });
  await expect
    .element(page.getByRole("link", { name: "1 update available" }))
    .toHaveAttribute("href", `/sites/${site}/drafts/dr_brand`);
});

test("someone who only reads submissions sees only what they can open", async () => {
  await renderOverview({ ...published, editing: null, newEntries: 4 });
  await expect
    .element(page.getByRole("link", { name: "4 new submissions in the last 7 days" }))
    .toBeVisible();
  expect(page.getByRole("link", { name: /drafts?\b/ }).query()).toBeNull();
  expect(page.getByRole("link", { name: /update/ }).query()).toBeNull();
  expect(page.getByRole("link", { name: /Published/ }).query()).toBeNull();
  await expect.element(page.getByText("Published 2 hours ago by Meera Kapoor")).toBeVisible();
});
