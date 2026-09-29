import { loadBlocks } from "@repo/blocks";
import { blockFixtures, fixtureSite, fixtureTree } from "@repo/blocks/fixtures";
import { Draft } from "@repo/contracts/draft";
import type { BatchId } from "@repo/contracts/ids";
import type { Batch } from "@repo/contracts/ops";
import type { BatchOutcome } from "@repo/contracts/studio";
import { applyOps } from "@repo/domain/document";
import { harbour } from "@repo/tokens";
import { Schema } from "effect";

import type { Connection } from "../../src/store.ts";

const lockfile = Object.fromEntries(blockFixtures.map((entry) => [entry.type, entry.version]));

const sections = blockFixtures
  .filter((entry) => ["hero", "feature-grid", "gallery"].includes(entry.type))
  .map(fixtureTree);

/** A draft whose home page holds a hero, feature grids and galleries from the block fixtures. */
export const fixtureDraft = Schema.decodeSync(Draft)({
  id: "dr_fixtures",
  site: "site_fixtures",
  base: { release: "rel_fixtures", snapshot: "snap_fixtures" },
  revision: 0,
  settings: fixtureSite.settings,
  parts: {
    header: "b_header",
    footer: "b_footer",
    blocks: {
      b_header: { type: "header", variant: "simple", surface: "default", props: {} },
      b_footer: { type: "footer", variant: "simple", surface: "muted", props: {} },
    },
    menus: fixtureSite.menus,
  },
  forms: fixtureSite.forms,
  lockfile,
  theme: harbour,
  pages: {
    pg_home: {
      schema: "pakshi.page/1",
      id: "pg_home",
      type: "page",
      path: "/",
      meta: { title: "Home", description: "" },
      root: sections.map((section) => section.id),
      blocks: Object.fromEntries(
        sections.flatMap(({ id, slots, ...section }) => [
          [
            id,
            slots === undefined
              ? section
              : {
                  ...section,
                  slots: Object.fromEntries(
                    Object.entries(slots).map(([slot, items]) => [
                      slot,
                      items.map((item) => item.id),
                    ]),
                  ),
                },
          ],
          ...Object.values(slots ?? {})
            .flat()
            .map(({ id: itemId, ...item }) => [itemId, item]),
        ]),
      ),
    },
  },
});

export const definitions = await loadBlocks(fixtureDraft.lockfile);

/**
 * SiteDoc as the editor sees it through a connection: it commits batches with
 * the real document module, applies a batch ID once, and can be made to drop
 * requests or hold them until released.
 */
export const fakeSiteDoc = (initial: Draft = fixtureDraft) => {
  let draft = initial;
  const committed = new Map<BatchId, number>();
  const received: Array<Batch> = [];
  let failing = 0;
  let held: Array<() => void> | null = null;

  const commit = (batch: Batch): BatchOutcome => {
    const earlier = committed.get(batch.id);
    if (earlier !== undefined) return { status: "committed", revision: earlier };
    const result = applyOps(draft, batch.ops, definitions);
    if (!result.ok) return { status: "rejected", errors: result.errors };
    draft = { ...result.draft, revision: draft.revision + 1 };
    committed.set(batch.id, draft.revision);
    return { status: "committed", revision: draft.revision };
  };

  const connection: Connection = {
    send: (batch) => {
      received.push(batch);
      if (failing > 0) {
        failing -= 1;
        return Promise.reject(new Error("The network dropped the request."));
      }
      if (held !== null) {
        const queue = held;
        return new Promise((resolve) => queue.push(() => resolve(commit(batch))));
      }
      return Promise.resolve(commit(batch));
    },
  };

  return {
    connection,
    /** The draft as SiteDoc has it. */
    draft: () => draft,
    /** Every batch the editor sent, resends included. */
    received,
    /** Makes the next `count` requests fail before they arrive. */
    failNext: (count: number) => {
      failing = count;
    },
    /** Holds requests until `release` answers them. */
    hold: () => {
      held = [];
    },
    release: () => {
      const queue = held ?? [];
      held = null;
      for (const answer of queue) answer();
    },
    /** Changes the draft behind the editor's back, as another person's commit would. */
    replace: (next: Draft) => {
      draft = next;
    },
  };
};
