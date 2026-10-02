import type { Draft } from "@repo/contracts/draft";
import { BlockId } from "@repo/contracts/ids";
import type { Batch, BatchError, Op, Target } from "@repo/contracts/ops";

import {
  type ApplyResult,
  applyEach,
  applyOps,
  type BlockContracts,
  type Step,
} from "./document.ts";
import { incompleteProps } from "./freeze.ts";

/*
 * How SiteDoc commits a batch to a draft that several people edit at once.
 * SiteDoc orders every batch, and the later write to a part of the draft
 * wins. To tell people when their write is replaced, and so that undo only
 * reverses what is still a person's own, a draft keeps who last wrote each
 * part of it.
 *
 * A part is named by a key of path segments from its page, or from `site`
 * for the header and footer: a field or a part of one, a block's variant,
 * surface or place, a whole block, a page's meta field, address, slug or status,
 * a whole page, a form, a menu, a redirect, or the site-wide values a
 * rebase sets. A write to a part
 * replaces every write to the parts below it.
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
    case "setSlug":
      return { own: keyOf([op.page, "slug"]), items: [] };
    case "createPage":
      return { own: keyOf([op.page.id]), items: [] };
    case "deletePage":
      return { own: keyOf([op.page]), items: [] };
    case "setStatus":
      return { own: keyOf([op.page, "status"]), items: [] };
    case "setForm":
      return { own: keyOf(["site", "forms", op.form.id]), items: [] };
    case "removeForm":
      return { own: keyOf(["site", "forms", op.form]), items: [] };
    case "setMenu":
      return { own: keyOf(["site", "menus", op.menu]), items: [] };
    case "setRedirect":
      return { own: keyOf(["site", "redirects", op.from]), items: [] };
    case "rebase":
      return { own: keyOf(["site", "rebase"]), items: [] };
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
  op.op === "setPath" ||
  op.op === "setSlug" ||
  op.op === "setStatus" ||
  op.op === "setForm" ||
  op.op === "setMenu" ||
  op.op === "setRedirect";

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

/** A block an op wrote to, and the field it wrote, or null when it placed the whole block. */
interface Written {
  readonly target: Target;
  readonly block: BlockId;
  readonly field: string | null;
}

/** The blocks and fields an op gave values to. */
const writtenBy = (op: Op): ReadonlyArray<Written> => {
  switch (op.op) {
    case "setProp":
      return [{ target: op.target, block: op.block, field: op.path[0] ?? null }];
    case "insertBlock":
      return [op.block, ...Object.values(op.block.slots ?? {}).flat()].map((block) => ({
        target: op.page,
        block: block.id,
        field: null,
      }));
    case "createPage":
      return Object.keys(op.page.blocks).map((block) => ({
        target: op.page.id,
        block: BlockId.make(block),
        field: null,
      }));
    default:
      return [];
  }
};

/** What an op left incomplete in the draft the batch made, as errors naming the op. */
const incompleteAfter = (
  draft: Draft,
  steps: ReadonlyArray<Step>,
  contracts: BlockContracts,
): ReadonlyArray<BatchError> =>
  steps.flatMap(({ op }, index) => [
    ...writtenBy(op).flatMap(({ target, block, field }) => {
      const holder = target === "site" ? draft.parts : draft.pages[target];
      const instance = holder?.blocks[block];
      const contract = instance === undefined ? undefined : contracts.get(instance.type);
      // Later ops in the batch may have removed it.
      if (instance === undefined || contract === undefined) return [];
      return incompleteProps(contract, instance.props)
        .filter((incomplete) => field === null || incomplete.path[0] === field)
        .map((incomplete) => ({
          op: index,
          path: [block, ...incomplete.path],
          rule: "incomplete" as const,
          message: `${incomplete.field}: ${incomplete.message}`,
        }));
    }),
    ...(op.op === "setMeta" &&
    (op.field === "title" || op.field === "description") &&
    (draft.pages[op.page]?.meta[op.field].trim() ?? "") === ""
      ? [
          {
            op: index,
            path: [op.field],
            rule: "incomplete" as const,
            message: `Fill in the ${op.field}`,
          },
        ]
      : []),
  ]);

/**
 * How a batch is checked. People's batches are held to the limits enforced
 * while typing, so someone can clear a field and retype it. The agent's are
 * also held to completeness, so it fills a field in instead of leaving it
 * empty or too short.
 */
export type Checks = "draft" | "complete";

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
  checks: Checks = "draft",
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
  if (!applied.ok) return applied;
  if (checks === "complete") {
    const errors = incompleteAfter(applied.draft, applied.steps, contracts);
    if (errors.length > 0) return { ok: false, errors };
  }
  return commit(applied, []);
};
