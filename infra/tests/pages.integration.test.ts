import { expect, test } from "@playwright/test";

import {
  addTextSection,
  admin,
  browserFor,
  clickWhenReady,
  createBrand,
  createSite,
  describePage,
  newDraft,
  openHome,
  siteAddress,
  submit,
  typeInto,
  unique,
  uniqueAddress,
  visit,
} from "./support/studio.ts";

test("an unpublished page leaves the menus and the sitemap, and its address says it has gone", async ({
  browser,
}) => {
  const priya = await browserFor(browser, "admin");
  const brand = unique("City Libraries");
  const address = uniqueAddress("pages");
  await createBrand(priya, brand);
  const launch = await createSite(priya, unique("Riverside Library"), brand, address);
  const site = new URL(launch).pathname.split("/")[2] ?? "";

  const home = await openHome(priya, launch);
  await addTextSection(priya, home, "Riverside Library", "Books, events and quiet rooms.");
  await describePage(priya, "Riverside Library's books, events and rooms.");

  await visit(priya, launch);
  const dialog = priya.getByRole("dialog", { name: "New page" });
  await clickWhenReady(priya.getByRole("button", { name: "New page" }), dialog);
  await dialog.getByLabel("Title", { exact: true }).fill("Opening hours");
  await dialog.getByRole("button", { name: "Create page" }).click();
  const canvas = priya.frameLocator("iframe[title^='Canvas']");
  await addTextSection(priya, canvas, "Opening hours", "Open every day from nine.");
  await describePage(priya, "When Riverside Library is open.");

  await visit(priya, launch);
  const menus = priya.getByRole("region", { name: "Main menu" });
  await clickWhenReady(
    menus.getByRole("button", { name: "Add item" }),
    menus.getByLabel("Links to", { exact: true }),
  );
  await menus.getByLabel("Links to", { exact: true }).selectOption({ label: "Opening hours" });
  await menus.getByLabel("Label", { exact: true }).fill("Hours");
  await menus.getByLabel("Label", { exact: true }).blur();
  await expect(menus.getByLabel("Label", { exact: true })).toHaveValue("Hours");
  await submit(priya, "Publish");

  const visitor = await browserFor(browser, "visitor");
  const live = siteAddress(address);
  await expect.poll(async () => (await visitor.request.get(live)).text()).toContain("Hours");
  expect(await (await visitor.request.get(`${live}/sitemap.xml`)).text()).toContain(
    "/opening-hours",
  );

  const draft = await newDraft(priya, site, "Close the hours page");
  await visit(priya, draft);
  await priya.getByRole("button", { name: "More for Opening hours" }).click();
  await priya.getByRole("menuitem", { name: "Unpublish" }).click();
  const confirm = priya.getByRole("alertdialog");
  await expect(confirm).toContainText("Its menu item is removed in this draft.");
  await confirm.getByRole("button", { name: "Unpublish" }).click();
  await expect(priya.getByText("Unpublished")).toBeVisible();
  await submit(priya, "Publish");

  await expect
    .poll(async () => (await visitor.request.get(`${live}/opening-hours`)).status())
    .toBe(410);
  expect(await (await visitor.request.get(live)).text()).not.toContain("Hours");
  expect(await (await visitor.request.get(`${live}/sitemap.xml`)).text()).not.toContain(
    "/opening-hours",
  );
});

test("a blog lists its posts on the live site and in its feed, and its posts follow it to a new address", async ({
  browser,
}) => {
  const priya = await browserFor(browser, "admin");
  const brand = unique("City Libraries");
  const address = uniqueAddress("blogs");
  await createBrand(priya, brand);
  const launch = await createSite(priya, unique("Riverside Library"), brand, address);
  const site = new URL(launch).pathname.split("/")[2] ?? "";

  const home = await openHome(priya, launch);
  await addTextSection(priya, home, "Riverside Library", "Books, events and quiet rooms.");
  await describePage(priya, "Riverside Library's books, events and rooms.");

  await visit(priya, launch);
  const newBlog = priya.getByRole("dialog", { name: "New blog" });
  await clickWhenReady(priya.getByRole("button", { name: "New blog" }), newBlog);
  await newBlog.getByLabel("Title", { exact: true }).fill("News");
  await expect(newBlog.getByLabel("Address", { exact: true })).toHaveValue("/news");
  await newBlog.getByRole("button", { name: "Create blog" }).click();
  const canvas = priya.frameLocator("iframe[title^='Canvas']");
  const list = canvas.locator('[data-pakshi-block]:has([data-pakshi-field="intro"])');
  await expect(list).toBeVisible();
  // The blog starts with a hero and a list of its own posts; this one keeps only the list.
  await priya.getByRole("tab", { name: "Outline" }).click();
  const hero = priya
    .getByRole("tabpanel", { name: "Outline" })
    .getByRole("treeitem", { name: /, Hero\b/ });
  await hero.getByRole("button", { name: /^Actions for / }).click();
  await priya.getByRole("menuitem", { name: /^Remove/ }).click();
  await expect(hero).toHaveCount(0);
  await typeInto(priya, list.locator('[data-pakshi-field="heading"]'), "Library news");
  await typeInto(priya, list.locator('[data-pakshi-field="intro"]'), "What's new at Riverside.");
  await expect(priya.getByText("Saved to the draft")).toBeVisible();
  await describePage(priya, "News from Riverside Library.");

  await visit(priya, launch);
  const newPost = priya.getByRole("dialog", { name: "New post in News" });
  await clickWhenReady(priya.getByRole("button", { name: "New post in News" }), newPost);
  await newPost.getByLabel("Title", { exact: true }).fill("Summer reading starts");
  const slug = "summer-reading-starts";
  await expect(newPost.getByLabel("Address", { exact: true })).toHaveValue(slug);
  await newPost.getByRole("button", { name: "Create post" }).click();
  const post = canvas.locator('[data-pakshi-block]:has([data-pakshi-field="body"])').last();
  await typeInto(priya, post.locator('[data-pakshi-field="heading"]'), "Read five, win a prize");
  await typeInto(
    priya,
    post.locator('[data-pakshi-field="body"]'),
    "Pick up a reading card at the front desk.",
  );
  await expect(priya.getByText("Saved to the draft")).toBeVisible();
  await describePage(priya, "The summer reading challenge is back.");
  await submit(priya, "Publish");

  const visitor = await browserFor(browser, "visitor");
  const live = siteAddress(address);
  await expect
    .poll(async () => (await visitor.request.get(`${live}/news`)).text())
    .toContain(`/news/${slug}`);
  expect(await (await visitor.request.get(`${live}/news`)).text()).toContain(
    "Summer reading starts",
  );

  await visitor.goto(`${live}/news/${slug}`);
  const header = visitor.locator("header").filter({ has: visitor.locator("time") });
  await expect(header.getByRole("heading", { level: 1 })).toHaveText("Summer reading starts");
  await expect(header).toContainText(admin.name);

  const feed = await (await visitor.request.get(`${live}/news/rss.xml`)).text();
  expect(feed).toContain("<title>Summer reading starts</title>");
  expect(feed).toContain(`/news/${slug}</link>`);
  expect(await (await visitor.request.get(`${live}/sitemap.xml`)).text()).toContain(
    `/news/${slug}`,
  );

  const draft = await newDraft(priya, site, "Move the news");
  await visit(priya, draft);
  await priya.getByRole("link", { name: "Edit News" }).click();
  await expect(canvas.locator("[data-pakshi-block]").first()).toBeVisible();
  const blogAddress = priya.getByLabel("Page address", { exact: true });
  await blogAddress.fill("/updates");
  await expect(
    priya.getByRole("checkbox", { name: "Send visitors from /news here" }),
  ).toBeChecked();
  await blogAddress.press("Enter");
  await expect(priya.getByText("Saved to the draft")).toBeVisible();
  await submit(priya, "Publish");

  const moved = () => visitor.request.get(`${live}/news/${slug}`, { maxRedirects: 0 });
  await expect.poll(async () => (await moved()).status()).toBe(301);
  expect(new URL((await moved()).headers().location ?? "", live).pathname).toBe(`/updates/${slug}`);
  expect((await visitor.request.get(`${live}/updates/${slug}`)).status()).toBe(200);
});
