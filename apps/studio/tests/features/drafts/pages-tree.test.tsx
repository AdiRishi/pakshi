import { PageId } from "@repo/contracts/ids";
import type { DraftPageSummary } from "@repo/contracts/studio";
import { expect, onTestFinished, test, vi } from "vitest";
import { page } from "vitest/browser";

import { harbour, summariesOf } from "./draft";
import { renderPages } from "./harness";

const stories: DraftPageSummary = {
  id: PageId.make("pg_stories"),
  path: "/stories",
  type: "collection",
  kind: "blog",
  meta: { title: "Stories", description: "" },
  standing: "new",
};

/** A post in Stories, published on the `day`th of May 2027. */
const story = (day: number): DraftPageSummary => ({
  id: PageId.make(`pg_story${day}`),
  path: `/stories/story-${day}`,
  type: "entry",
  kind: "blog",
  collection: stories.id,
  meta: {
    title: `Story ${day}`,
    description: "",
    date: `2027-05-${String(day).padStart(2, "0")}`,
    author: "Sam Okafor",
    tags: [],
    excerpt: "",
  },
  standing: "new",
});

/** What each row's first cell says, in order. */
const firstCells = () =>
  Array.from(document.querySelectorAll("tbody tr td:first-child"), (cell) => cell.textContent);

const title = (name: string) => page.getByText(name, { exact: true });

test("a blog says how many posts it holds, and lists them under it newest first", async () => {
  await renderPages(summariesOf(harbour));
  await expect.element(page.getByText("Blog · 2 posts")).toBeVisible();
  expect(firstCells()).toEqual([
    "Harbour Summer School",
    "NewsBlog · 2 posts",
    "Meet this year's mentors15 Apr 2027",
    "Dates for this summer are out2 Mar 2027",
    "Programme",
  ]);

  await page.getByRole("button", { name: "Hide posts in News" }).click();
  expect(title("Meet this year's mentors").query()).toBeNull();
  await expect
    .element(page.getByRole("button", { name: "Show posts in News" }))
    .toHaveAttribute("aria-expanded", "false");
});

test("a blog with more than ten posts starts folded, and unfolds to show them all", async () => {
  const posts = Array.from({ length: 11 }, (_, index) => story(index + 1));
  await renderPages([...summariesOf(harbour), stories, ...posts]);
  await expect.element(page.getByText("Blog · 11 posts")).toBeVisible();
  expect(title("Story 11").query()).toBeNull();
  await expect.element(title("Meet this year's mentors")).toBeVisible();

  await page.getByRole("button", { name: "Show posts in Stories" }).click();
  await expect.element(title("Story 11")).toBeVisible();
  await expect.element(title("Story 1")).toBeVisible();
});

test("a blog with no posts says how to write the first", async () => {
  await renderPages([...summariesOf(harbour), stories]);
  await expect.element(page.getByText(/^No posts yet\./)).toBeVisible();
  await page.getByRole("button", { name: "Write the first post" }).click();
  await expect.element(page.getByRole("dialog", { name: "New post in Stories" })).toBeVisible();
});

test("New post makes a post in the blog it was asked from, dated today where the person is, and by them", async () => {
  // Just after midnight on 3 March where the person is, which east of UTC is 2 March in UTC.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2027, 2, 3, 0, 30));
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const { sent, opened } = await renderPages([...summariesOf(harbour), stories]);
  await page.getByRole("button", { name: "New post in Stories" }).click();
  const dialog = page.getByRole("dialog", { name: "New post in Stories" });
  await dialog.getByLabelText("Title", { exact: true }).fill("Regatta day");
  await expect
    .element(dialog.getByLabelText("Address", { exact: true }))
    .toHaveValue("regatta-day");
  await expect.element(dialog.getByText("/stories/", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Create post" }).click();

  await expect.poll(() => opened.length).toBe(1);
  const [ops] = sent;
  const [op] = ops ?? [];
  expect(op).toMatchObject({
    op: "createPage",
    page: {
      id: opened[0],
      type: "entry",
      kind: "blog",
      collection: "pg_stories",
      slug: "regatta-day",
      meta: { title: "Regatta day", date: "2027-03-03", author: "Meera Kapoor" },
    },
  });
});

test("New blog makes a blog at the address its title gives it", async () => {
  const { sent, opened } = await renderPages(summariesOf(harbour));
  await page.getByRole("button", { name: "New blog" }).click();
  const dialog = page.getByRole("dialog", { name: "New blog" });
  await dialog.getByLabelText("Title", { exact: true }).fill("Boat builders");
  await dialog.getByRole("button", { name: "Create blog" }).click();

  await expect.poll(() => opened.length).toBe(1);
  expect(sent[0]?.[0]).toMatchObject({
    op: "createPage",
    page: { type: "collection", kind: "blog", path: "/boat-builders", recipe: "blog" },
  });
});
