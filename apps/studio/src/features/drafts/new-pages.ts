import type { BlockContract } from "@repo/blocks/contract";
import { pageFromRecipe, type Recipe, recipeById } from "@repo/blocks/recipes";
import { type BlockType, PageId, randomId } from "@repo/contracts/ids";
import type { PageDocument, PagePath, Slug } from "@repo/contracts/page";
import type { PageListing } from "@repo/contracts/snapshot";

const recipe = (id: string): Recipe => {
  const found = recipeById(id);
  if (found === undefined) throw new Error(`The library has no ${id} recipe.`);
  return found;
};

/** An empty page, which the person builds from scratch. */
export const newPage = (values: { readonly title: string; readonly path: PagePath }) =>
  ({
    schema: "pakshi.page/1",
    id: PageId.make(randomId("pg")),
    type: "page",
    path: values.path,
    meta: { title: values.title, description: "" },
    root: [],
    blocks: {},
  }) satisfies PageDocument;

/** A new blog from its recipe, whose list shows its own posts. */
export const newBlog = (input: {
  readonly contracts: ReadonlyMap<BlockType, BlockContract>;
  readonly listings: ReadonlyArray<PageListing>;
  readonly title: string;
  readonly path: PagePath;
}): PageDocument =>
  pageFromRecipe({
    recipe: recipe("blog"),
    contracts: input.contracts,
    listings: input.listings,
    page: {
      id: PageId.make(randomId("pg")),
      path: input.path,
      meta: { title: input.title, description: "" },
    },
  });

/** A new post in `blog` from its recipe, dated `today`, by `author`. */
export const newPost = (input: {
  readonly contracts: ReadonlyMap<BlockType, BlockContract>;
  readonly listings: ReadonlyArray<PageListing>;
  readonly blog: PageId;
  readonly title: string;
  readonly slug: Slug;
  readonly author: string;
  readonly today: string;
}): PageDocument =>
  pageFromRecipe({
    recipe: recipe("post"),
    contracts: input.contracts,
    listings: input.listings,
    page: {
      id: PageId.make(randomId("pg")),
      collection: input.blog,
      slug: input.slug,
      meta: {
        title: input.title,
        description: "",
        date: input.today,
        author: input.author,
        tags: [],
        excerpt: "",
      },
    },
  });
