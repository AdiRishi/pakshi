import type { BlockContract } from "@repo/blocks/contract";
import { pageFromRecipe, type Recipe, recipeById } from "@repo/blocks/recipes";
import { collectionKinds } from "@repo/contracts/collections";
import { type BlockType, PageId, randomId } from "@repo/contracts/ids";
import type { CollectionKind, PageDocument, PagePath, Slug } from "@repo/contracts/page";
import type { PageListing } from "@repo/contracts/snapshot";
import { DateTime } from "effect";

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

/**
 * A new post in `blog` from its recipe, by `author`, dated today where the
 * person creating it is.
 */
export const newPost = (input: {
  readonly contracts: ReadonlyMap<BlockType, BlockContract>;
  readonly listings: ReadonlyArray<PageListing>;
  readonly blog: { readonly id: PageId; readonly kind: CollectionKind };
  readonly title: string;
  readonly slug: Slug;
  readonly author: string;
}): PageDocument =>
  pageFromRecipe({
    recipe: recipe("post"),
    contracts: input.contracts,
    listings: input.listings,
    page: {
      id: PageId.make(randomId("pg")),
      collection: input.blog.id,
      slug: input.slug,
      meta: collectionKinds[input.blog.kind].newMeta({
        title: input.title,
        description: "",
        author: input.author,
        now: DateTime.nowUnsafe(),
        timeZone: DateTime.zoneMakeLocal(),
      }),
    },
  });
