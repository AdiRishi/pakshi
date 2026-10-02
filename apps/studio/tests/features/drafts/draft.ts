import { latestLockfile, loadBlocks } from "@repo/blocks";
import { blockFixtures, fixtureDraft, fixtureTree } from "@repo/blocks/fixtures";
import type { Draft } from "@repo/contracts/draft";
import { type PageId } from "@repo/contracts/ids";
import { listingsOf } from "@repo/contracts/snapshot";
import type { DraftPageSummary } from "@repo/contracts/studio";

export const contracts = await loadBlocks(latestLockfile);

const fixture = (type: string, name: string) => {
  const entry = blockFixtures.find(
    (candidate) =>
      candidate.type === type &&
      candidate.name === name &&
      candidate.version === latestLockfile[candidate.type],
  );
  if (entry === undefined) throw new Error(`No fixture ${type} ${name}.`);
  return fixtureTree(entry);
};

/**
 * Harbour Summer School's draft: a home page, a programme page, and the
 * News blog with two posts, which the main menu links to.
 */
export const harbour: Draft = fixtureDraft({
  lockfile: latestLockfile,
  header: fixture("header", "standard"),
  footer: fixture("footer", "simple"),
  sections: [],
});

/** A draft's pages as its Pages and menus screen lists them, each as live as `standing` says. */
export const summariesOf = (
  draft: Draft,
  standing: (page: PageId) => DraftPageSummary["standing"] = () => "live",
): ReadonlyArray<DraftPageSummary> =>
  listingsOf(draft.pages).map((listing) => ({ ...listing, standing: standing(listing.id) }));
