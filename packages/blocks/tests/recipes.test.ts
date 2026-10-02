import { BlockType, PageId } from "@repo/contracts/ids";
import type { PageDocument } from "@repo/contracts/page";
import { expect, test } from "vitest";

import { fixtureSite } from "../src/fixtures.ts";
import { pageFromRecipe, type Recipe, recipeById, recipes } from "../src/recipes.ts";
import { latestLockfile, loadBlocks } from "../src/render.tsx";

const contracts = await loadBlocks(latestLockfile);

const recipe = (id: string): Recipe => {
  const found = recipeById(id);
  if (found === undefined) throw new Error(`There's no ${id} recipe.`);
  return found;
};

/** What the blog lists on a page show. */
const listed = (page: PageDocument) =>
  Object.values(page.blocks)
    .filter((block) => block.type === "post-list")
    .map((block) => block.props["collection"]);

const meta = { title: "Stories", description: "" };

test("every recipe builds its pages from sections in the library", () => {
  for (const each of recipes)
    for (const { type } of each.sections)
      expect(contracts.get(type)?.placement, `${each.id} uses ${type}`).toBe("section");
});

test("a new blog lists its own posts", () => {
  const blog = pageFromRecipe({
    recipe: recipe("blog"),
    contracts,
    pages: fixtureSite.pages,
    page: { id: PageId.make("pg_stories"), path: "/stories", meta },
  });
  expect(blog).toMatchObject({ type: "collection", kind: "blog", recipe: "blog" });
  expect(listed(blog)).toEqual([{ $ref: "page", id: "pg_stories" }]);
});

test("a new page's blog list shows the site's only blog, and waits for a choice among several", () => {
  const page = { id: PageId.make("pg_more"), path: "/more", meta } as const;
  const sections = [BlockType.make("hero"), BlockType.make("post-list")];
  const withOne = pageFromRecipe({
    recipe: recipe("landing"),
    contracts,
    pages: fixtureSite.pages,
    page,
    sections,
  });
  expect(listed(withOne)).toEqual([{ $ref: "page", id: "pg_news" }]);
  const stories = pageFromRecipe({
    recipe: recipe("blog"),
    contracts,
    pages: fixtureSite.pages,
    page: { id: PageId.make("pg_stories"), path: "/stories", meta },
  });
  const withTwo = pageFromRecipe({
    recipe: recipe("landing"),
    contracts,
    pages: { ...fixtureSite.pages, [stories.id]: stories },
    page,
    sections,
  });
  expect(listed(withTwo)).toEqual([{ $ref: "page", id: "pg_pakshiBlog" }]);
});

test("a new post goes in its blog and starts with its header", () => {
  const post = pageFromRecipe({
    recipe: recipe("post"),
    contracts,
    pages: fixtureSite.pages,
    page: {
      id: PageId.make("pg_regatta"),
      collection: PageId.make("pg_news"),
      slug: "regatta",
      meta: {
        title: "Regatta day",
        description: "",
        date: "2027-06-01",
        author: "Meera Kapoor",
        tags: [],
        excerpt: "",
      },
    },
  });
  expect(post).toMatchObject({ type: "entry", kind: "blog", collection: "pg_news" });
  expect(post.root.map((id) => post.blocks[id]?.type)).toEqual(["post-header", "rich-text"]);
});
