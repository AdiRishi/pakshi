import type { Draft } from "@repo/contracts/draft";
import type { Batch, BatchError, Op } from "@repo/contracts/ops";

import {
  type ApplyResult,
  applyEach,
  applyOps,
  type BlockContracts,
  type Step,
} from "./document.ts";

/*
 * How SiteDoc commits a batch to a draft that several people edit at once.
 * SiteDoc orders every batch, and the later write to a part of the draft
 * wins. To tell people when their write is replaced, and so that undo only
 * reverses what is still a person's own, a draft keeps who last wrote each
 * part of it.
 *
 * A part is named by a key of path segments from its page, or from `site`
 * for the header and footer: a field or a part of one, a block's variant,
 * surface or place, a whole block, a page's meta field or address, or a
 * whole page. A write to a part replaces every write to the parts below it.
 */

/** Who wrote a part of a draft last, and the revision their batch made. */
export interface Write {
  readonly actor: string;
  readonly revision: number;
}

/** The latest write to each part of a draft, by the part's key. */
export type Writes = ReadonlyMap<string, Write>;

/** What a commit changed in a draft's writes, so storage can apply exactly that. */
export interface WritesChange {
  readonly set: ReadonlyArray<readonly [string, Write]>;
  readonly removed: ReadonlyArray<string>;
}

/** Someone whose write a committed op replaced. */
export interface Replaced {
  readonly actor: string;
  /** The op's position among the ops that applied. */
  readonly op: number;
}

export type CommitResult =
  | {
      readonly ok: true;
      /** The draft at its next revision. */
      readonly draft: Draft;
      readonly writes: Writes;
      readonly writesChange: WritesChange;
      /** The ops that applied: the whole batch, or the parts of an undo still its author's own. */
      readonly ops: ReadonlyArray<Op>;
      readonly inverse: ReadonlyArray<Op>;
      /** Positions in the batch of the undo ops passed over. */
      readonly skipped: ReadonlyArray<number>;
      readonly replaced: ReadonlyArray<Replaced>;
    }
  | { readonly ok: false; readonly errors: ReadonlyArray<BatchError> };

const separator = "\u001f";

const keyOf = (segments: ReadonlyArray<string>) => segments.join(separator);

const isBelow = (key: string, above: string) => key.startsWith(`${above}${separator}`);

/** A key and the keys of every part above it, nearest first. */
const keyAndAbove = (key: string) => {
  const segments = key.split(separator);
  return segments.map((_, index) => keyOf(segments.slice(0, segments.length - index)));
};

/** The part an op writes, and every part it covers: a whole block covers its items too. */
const partsOf = ({ op, before }: Step) => {
  switch (op.op) {
    case "setProp":
      return { own: keyOf([op.target, op.block, "props", ...op.path]), items: [] };
    case "setVariant":
      return { own: keyOf([op.target, op.block, "variant"]), items: [] };
    case "setSurface":
      return { own: keyOf([op.target, op.block, "surface"]), items: [] };
    case "insertBlock":
      return {
        own: keyOf([op.page, op.block.id]),
        items: Object.values(op.block.slots ?? {})
          .flat()
          .map((item) => keyOf([op.page, item.id])),
      };
    case "moveBlock":
      return { own: keyOf([op.page, op.block, "position"]), items: [] };
    case "removeBlock":
      return {
        own: keyOf([op.page, op.block]),
        items: Object.values(before.pages[op.page]?.blocks[op.block]?.slots ?? {})
          .flat()
          .map((item) => keyOf([op.page, item])),
      };
    case "setMeta":
      return { own: keyOf([op.page, "meta", op.field]), items: [] };
    case "setPath":
      return { own: keyOf([op.page, "path"]), items: [] };
    case "createPage":
      return { own: keyOf([op.page.id]), items: [] };
    case "deletePage":
      return { own: keyOf([op.page]), items: [] };
  }
};

const coveredBy = (step: Step) => {
  const { own, items } = partsOf(step);
  return [own, ...items];
};

/** Ops that set a value, as opposed to changing a page's structure. */
const setsValue = (op: Op) =>
  op.op === "setProp" ||
  op.op === "setVariant" ||
  op.op === "setSurface" ||
  op.op === "setMeta" ||
  op.op === "setPath";

const writesAt = (writes: Writes, keys: ReadonlyArray<string>) =>
  keys.flatMap((key) => {
    const write = writes.get(key);
    return write === undefined ? [] : [write];
  });

const writesBelow = (writes: Writes, key: string) =>
  Array.from(writes).flatMap(([found, write]) => (isBelow(found, key) ? [write] : []));

/**
 * Whether an undo op would erase someone else's change. The op reverses the
 * actor's own write only if theirs is the latest to its part or a part above
 * it, and no one else has written to anything it covers since.
 */
const erasesOthers = (writes: Writes, actor: string, step: Step) => {
  const { own } = partsOf(step);
  const mine = writesAt(writes, keyAndAbove(own)).reduce<Write | undefined>(
    (latest, write) => (latest === undefined || write.revision > latest.revision ? write : latest),
    undefined,
  );
  if (mine?.actor !== actor) return true;
  return coveredBy(step).some((key) =>
    [...writesAt(writes, keyAndAbove(key)), ...writesBelow(writes, key)].some(
      (write) => write.actor !== actor && write.revision > mine.revision,
    ),
  );
};

/** People other than the actor whose writes to a value, or to parts of it, a step replaces. */
const replacedBy = (writes: Writes, actor: string, step: Step) => {
  if (!setsValue(step.op)) return [];
  const { own } = partsOf(step);
  const others = [...writesAt(writes, [own]), ...writesBelow(writes, own)].flatMap((write) =>
    write.actor === actor ? [] : [write.actor],
  );
  return Array.from(new Set(others));
};

/** Records the actor's write to every part the steps cover, replacing the writes below each. */
const record = (writes: Writes, actor: string, revision: number, steps: ReadonlyArray<Step>) => {
  const next = new Map(writes);
  const set = new Map<string, Write>();
  const removed = new Set<string>();
  for (const key of steps.flatMap(coveredBy)) {
    for (const found of Array.from(next.keys()))
      if (isBelow(found, key)) {
        next.delete(found);
        set.delete(found);
        removed.add(found);
      }
    next.set(key, { actor, revision });
    set.set(key, { actor, revision });
    removed.delete(key);
  }
  return { writes: next, change: { set: Array.from(set), removed: Array.from(removed) } };
};

/**
 * Commits a batch for `actor`, taking the draft to its next revision. A batch
 * applies all or nothing. An undo batch applies each op that still applies
 * and would erase no one else's change, and passes over the rest.
 */
export const commitBatch = (
  draft: Draft,
  writes: Writes,
  actor: string,
  batch: Batch,
  contracts: BlockContracts,
): CommitResult => {
  const commit = (
    applied: Pick<Extract<ApplyResult, { ok: true }>, "draft" | "inverse" | "steps">,
    skipped: ReadonlyArray<number>,
  ): CommitResult => {
    const revision = draft.revision + 1;
    const recorded = record(writes, actor, revision, applied.steps);
    return {
      ok: true,
      draft: { ...applied.draft, revision },
      writes: recorded.writes,
      writesChange: recorded.change,
      ops: applied.steps.map((step) => step.op),
      inverse: applied.inverse,
      skipped,
      replaced: applied.steps.flatMap((step, index) =>
        replacedBy(writes, actor, step).map((other) => ({ actor: other, op: index })),
      ),
    };
  };
  if (batch.undo === true) {
    const applied = applyEach(
      draft,
      batch.ops,
      contracts,
      (op, before) => !erasesOthers(writes, actor, { op, before }),
    );
    return commit(applied, applied.skipped);
  }
  const applied = applyOps(draft, batch.ops, contracts);
  return applied.ok ? commit(applied, []) : applied;
};
