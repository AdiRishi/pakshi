import { DateTime, Order } from "effect";

import type { PageId } from "./ids.ts";
import type { CollectionKind, PostMeta } from "./page.ts";

interface KindDefinition {
  /** What people call the kind and its entries, such as a Blog of posts. */
  readonly names: { readonly kind: string; readonly one: string; readonly many: string };
  /** The order a collection's entries are listed in. */
  readonly order: Order.Order<PostMeta>;
  /**
   * A new entry's meta: its title and description, `author`, and the date it
   * is `now` where the author is, in `timeZone`. A post written on a Sydney
   * morning is dated that day, while in UTC it's still the day before.
   */
  readonly newMeta: (input: {
    readonly title: string;
    readonly description: string;
    readonly author: string;
    readonly now: DateTime.DateTime;
    readonly timeZone: DateTime.TimeZone;
  }) => PostMeta;
}

/** What each built-in kind of collection does. */
export const collectionKinds = {
  blog: {
    names: { kind: "Blog", one: "post", many: "posts" },
    // Newest first, then by title.
    order: Order.combine(
      Order.flip(Order.mapInput(Order.String, (meta: PostMeta) => meta.date)),
      Order.mapInput(Order.String, (meta: PostMeta) => meta.title),
    ),
    newMeta: ({ title, description, author, now, timeZone }) => ({
      title,
      description,
      date: DateTime.formatIsoDate(DateTime.setZone(now, timeZone)),
      author,
      tags: [],
      excerpt: "",
    }),
  },
} as const satisfies Record<CollectionKind, KindDefinition>;

/** Any form of a page: a document, a listing, or a summary built on one. */
type AnyPage =
  | { readonly type: "page" | "collection" }
  | { readonly type: "entry"; readonly collection: PageId; readonly meta: PostMeta };

/** The entries `collection` holds among `pages`, in its kind's order. */
export const entriesOf = <Page extends AnyPage>(
  pages: Iterable<Page>,
  collection: { readonly id: PageId; readonly kind: CollectionKind },
) =>
  Array.from(pages)
    .filter(
      (page): page is Extract<Page, { readonly type: "entry" }> =>
        page.type === "entry" && page.collection === collection.id,
    )
    .toSorted(Order.mapInput(collectionKinds[collection.kind].order, (entry) => entry.meta));

const lastPage = 1000;

/**
 * Which page of a collection's entries a request asks for, from `?page=N`.
 * Anything but a whole number from 2 to 1000 reads as the first page, so a
 * site's page cache holds at most a thousand copies of an address however
 * it's asked for.
 */
export const pageNumberOf = (url: URL) => {
  const asked = url.searchParams.get("page");
  if (asked === null || !/^[1-9][0-9]{0,3}$/.test(asked)) return 1;
  const number = Number(asked);
  return number <= lastPage ? number : 1;
};
