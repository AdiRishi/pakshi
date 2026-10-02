import type { PageId } from "@repo/contracts/ids";
import { batchLimit, type Op } from "@repo/contracts/ops";
import type { Menus } from "@repo/contracts/site";
import type { DraftPageSummary } from "@repo/contracts/studio";
import { menusWithout } from "@repo/domain/document";
import { Array as Arr } from "effect";

type Entry = Extract<DraftPageSummary, { readonly type: "entry" }>;

/** The entries a collection holds in the draft, or none for any other page. */
export const entriesIn = (
  page: DraftPageSummary,
  pages: ReadonlyArray<DraftPageSummary>,
): ReadonlyArray<Entry> =>
  page.type === "collection"
    ? pages.filter(
        (entry): entry is Entry => entry.type === "entry" && entry.collection === page.id,
      )
    : [];

/**
 * The batches that unpublish or delete a page, a collection with its entries:
 * menu items that link to any of them go, then a deleted collection's entries,
 * the redirect from its address, and the page itself. A collection can't be
 * deleted while it holds entries, so a batch too big for one takes its
 * entries out over several before the last deletes it.
 */
export const removalBatches = (input: {
  readonly page: DraftPageSummary;
  readonly pages: ReadonlyArray<DraftPageSummary>;
  readonly menus: Menus;
  readonly action: "unpublish" | "delete";
  readonly redirectTo: PageId | null;
}): ReadonlyArray<ReadonlyArray<Op>> => {
  const { page } = input;
  const entries = entriesIn(page, input.pages).map((entry) => entry.id);
  const ops: Array<Op> = [...menusWithout(input.menus, page.id, ...entries)];
  if (input.action === "delete")
    ops.push(...entries.map((entry): Op => ({ op: "deletePage", page: entry })));
  if (input.redirectTo !== null)
    ops.push({ op: "setRedirect", from: page.path, to: { $ref: "page", id: input.redirectTo } });
  ops.push(
    input.action === "delete"
      ? { op: "deletePage", page: page.id }
      : { op: "setStatus", page: page.id, status: "unpublished" },
  );
  return Arr.chunksOf(ops, batchLimit);
};
