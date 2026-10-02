import { Order } from "effect";

import type { CollectionKind, PostMeta } from "./page.ts";

interface KindDefinition {
  /** What people call the kind and its entries, such as a Blog of posts. */
  readonly names: { readonly kind: string; readonly one: string; readonly many: string };
  /** The order a collection's entries are listed in. */
  readonly order: Order.Order<PostMeta>;
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
  },
} as const satisfies Record<CollectionKind, KindDefinition>;
