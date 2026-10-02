import type { BlockType, PageId } from "@repo/contracts/ids";
import type {
  CollectionKind,
  PageDocument,
  PageMeta,
  PagePath,
  PostMeta,
  Slug,
} from "@repo/contracts/page";
import { listingOf, type PageListing } from "@repo/contracts/snapshot";

import type { BlockContract } from "./contract.ts";
import { collectionFor, placeholderTree, withCollections } from "./placeholders.ts";
import { flattenTree } from "./render.tsx";

/*
 * A recipe is how the agent composes one kind of page from the library's
 * blocks: the sections it starts with, in order, what each is for, and the
 * rules for changing it. Recipes name block types, never versions, so a site
 * builds a page from a recipe at the versions its lockfile pins.
 */

export interface RecipeSection {
  readonly type: BlockType;
  /** What the section does on this kind of page, for the agent and a plan. */
  readonly purpose: string;
  /** Whether the page needs it. Others can be left out when the brief has nothing for them. */
  readonly required: boolean;
}

export interface Recipe {
  readonly id: string;
  readonly title: string;
  /** What the recipe makes: a page, a collection of one kind, or an entry in one. */
  readonly makes:
    | { readonly type: "page" }
    | { readonly type: "collection" | "entry"; readonly kind: CollectionKind };
  /** When to use it, in one line. */
  readonly purpose: string;
  /** The sections a new page starts with, in order. */
  readonly sections: ReadonlyArray<RecipeSection>;
  /** How to change the page without breaking what makes it work. */
  readonly rules: ReadonlyArray<string>;
}

const section = (type: BlockType, purpose: string, required = true): RecipeSection => ({
  type,
  purpose,
  required,
});

export const recipes: ReadonlyArray<Recipe> = [
  {
    id: "landing",
    title: "Landing page",
    makes: { type: "page" },
    purpose: "A site's home page, or a page that sells one thing and asks for one action",
    sections: [
      section("hero", "What this is and the one thing to do next"),
      section("feature-grid", "Three to six reasons to care, each a short point"),
      section("split", "One idea explained beside a photo that shows it", false),
      section("gallery", "Photos that show the place, the people or the work", false),
      section("call-to-action", "The same action as the hero, asked again at the end"),
    ],
    rules: [
      "Keep one primary action, the same in the hero and the closing call to action.",
      "Put the most important reason first in the feature grid.",
      "Alternate the image side when splits follow each other.",
    ],
  },
  {
    id: "event",
    title: "Event page",
    makes: { type: "page" },
    purpose: "One event, or a programme of them, with its dates, place and a way to sign up",
    sections: [
      section("hero", "The event's name, dates and place, with a button to register"),
      section("rich-text", "What happens, who it's for and what it costs"),
      section("feature-grid", "The programme or highlights, one point each", false),
      section("gallery", "Photos from earlier events or of the venue", false),
      section("form-section", "Registration, when people sign up on this site", false),
      section("call-to-action", "How to register when the form is elsewhere", false),
    ],
    rules: [
      "Put dates, times and the place in the hero, never only further down.",
      "Use either a registration form or a call to action to register, not both.",
      "Leave a placeholder for any date, time or price the brief doesn't give.",
    ],
  },
  {
    id: "information",
    title: "Information page",
    makes: { type: "page" },
    purpose: "Practical details such as visiting, opening hours, contact or policies",
    sections: [
      section("hero", "What the page answers, in a sentence"),
      section("rich-text", "The details, with subheadings people can scan"),
      section("split", "A place or service shown beside its details", false),
      section("form-section", "An enquiry form, when the page invites questions", false),
    ],
    rules: [
      "Lead with the answer people come for, such as hours or an address.",
      "Break long text into subheadings and lists rather than adding sections.",
    ],
  },
  {
    id: "blog",
    title: "Blog",
    makes: { type: "collection", kind: "blog" },
    purpose: "A page that holds posts, such as news or stories, and lists them",
    sections: [
      section("hero", "What the blog is about"),
      section("post-list", "This blog's posts, newest first, a page at a time"),
      section("call-to-action", "A next step for readers, such as signing up", false),
    ],
    rules: [
      "Name it for what it holds, such as News or Stories.",
      "A site can have several.",
      "Keep the hero short, so posts appear high on the page.",
    ],
  },
  {
    id: "post",
    title: "Blog post",
    makes: { type: "entry", kind: "blog" },
    purpose: "One blog post: news, a story or an announcement",
    sections: [
      section("post-header", "The post's title, date, author and excerpt, from its settings"),
      section("rich-text", "The post itself"),
      section("gallery", "Photos the post talks about", false),
      section("call-to-action", "What readers can do next", false),
    ],
    rules: [
      "Give the post a date, an author and an excerpt.",
      "Write the post in one rich text section, with subheadings for long posts.",
    ],
  },
];

/** A recipe by its ID. */
export const recipeById = (id: string) => recipes.find((recipe) => recipe.id === id);

/** Where a new page goes and what it's called: an address for a page or a collection, a slug in a collection for an entry. */
export type NewPage =
  | { readonly id: PageId; readonly path: PagePath; readonly meta: PageMeta }
  | {
      readonly id: PageId;
      readonly collection: PageId;
      readonly slug: Slug;
      readonly meta: PostMeta;
    };

/** An empty page of the type a recipe makes. */
const emptyPage = (recipe: Recipe, page: NewPage): PageDocument => {
  const common = { schema: "pakshi.page/1", recipe: recipe.id, root: [], blocks: {} } as const;
  const { makes } = recipe;
  if (makes.type === "entry") {
    if (!("collection" in page))
      throw new Error(
        `The ${recipe.id} recipe makes an entry, which needs a collection and a slug.`,
      );
    return { ...common, ...page, type: "entry", kind: makes.kind };
  }
  if (!("path" in page))
    throw new Error(`The ${recipe.id} recipe makes a page, which needs an address.`);
  return makes.type === "collection"
    ? { ...common, ...page, type: "collection", kind: makes.kind }
    : { ...common, ...page, type: "page" };
};

/**
 * A new page that a recipe makes, with `sections` or else the recipe's
 * required ones, each with its placeholder content. A listing among them
 * shows the collection `collectionFor` picks once the page is among the
 * site's `listings`, so a new collection lists itself.
 */
export const pageFromRecipe = (input: {
  readonly recipe: Recipe;
  readonly contracts: ReadonlyMap<BlockType, BlockContract>;
  readonly listings: ReadonlyArray<PageListing>;
  readonly page: NewPage;
  readonly sections?: ReadonlyArray<BlockType>;
}): PageDocument => {
  const { recipe, page } = input;
  const types =
    input.sections ??
    recipe.sections.filter((section) => section.required).map((section) => section.type);
  const empty = emptyPage(recipe, page);
  // An entry is never the collection a listing shows, and its address needs its collection's.
  const listings =
    empty.type === "entry" ? input.listings : [...input.listings, listingOf({}, empty)];
  const sections = types.map((type) =>
    withCollections(placeholderTree(input.contracts, type), input.contracts, (kind) =>
      collectionFor(listings, page.id, kind),
    ),
  );
  return {
    ...empty,
    root: sections.map((section) => section.id),
    blocks: Object.fromEntries(sections.flatMap(flattenTree)),
  };
};
