import { type Field, fieldAt } from "@repo/blocks/fields";
import { placeholderMedia, placeholderTree } from "@repo/blocks/placeholders";
import type { Draft } from "@repo/contracts/draft";
import type { BlockId, BlockType, MediaId } from "@repo/contracts/ids";
import type { BatchError, BlockTree, ItemTree, Op, Target } from "@repo/contracts/ops";
import { MediaRef } from "@repo/contracts/references";
import type { BlockContracts } from "@repo/domain/document";
import { Result, Schema } from "effect";

import { type ContentProblem, storedProps, storedValue } from "./content.ts";
import { pageName } from "./site-view.ts";
import type { AgentOp, NewBlock } from "./tools.ts";
import type { TypingIn } from "./workspace.ts";

/*
 * The agent's edits as the document module takes them. The agent writes rich
 * text as Markdown and leaves out the IDs of what it adds; these are
 * converted and given here. The document module then checks everything
 * else when the batch commits.
 */

type Json = Schema.Json;

const isMediaRef = Schema.is(MediaRef);
const isJsonObject = Schema.is(Schema.JsonObject);

const describe = ({ path, message }: ContentProblem) =>
  path.length === 0 ? message : `${path.join(".")}: ${message}`;

/** A new block from the agent's description, with placeholder content for whatever it left out. */
export const buildBlock = (
  contracts: BlockContracts,
  spec: NewBlock,
): Result.Result<BlockTree, string> => {
  const contract = contracts.get(spec.type);
  if (contract === undefined)
    return Result.fail(
      `This site has no ${spec.type} block. It has ${Array.from(contracts.keys()).join(", ")}.`,
    );
  if (contract.placement !== "section" && contract.placement !== "item")
    return Result.fail(`A ${contract.title} can't be added to a page.`);
  const tree = placeholderTree(contracts, spec.type);
  const props = storedProps(contract.fields, spec.props ?? {});
  if (Result.isFailure(props)) return Result.fail(describe(props.failure));
  const slotNames = contract.placement === "section" ? Object.keys(contract.slots) : [];
  const items = Result.all(
    (spec.items ?? []).map((item): Result.Result<readonly [string, ItemTree], string> => {
      const slot = item.slot ?? (slotNames.length === 1 ? slotNames[0] : undefined);
      if (slot === undefined || !slotNames.includes(slot))
        return Result.fail(
          slotNames.length === 0
            ? `A ${contract.title} has no items.`
            : `Say which slot each item goes in: ${slotNames.join(" or ")}.`,
        );
      return Result.map(
        buildBlock(contracts, item),
        ({ id, type, variant, props: itemProps }) =>
          [slot, { id, type, variant, props: itemProps }] as const,
      );
    }),
  );
  if (Result.isFailure(items)) return Result.fail(items.failure);
  let block: BlockTree = {
    ...tree,
    variant: spec.variant ?? tree.variant,
    props: { ...tree.props, ...props.success },
  };
  if (spec.surface !== undefined) block = { ...block, surface: spec.surface };
  if (items.success.length > 0)
    block = {
      ...block,
      slots: {
        ...tree.slots,
        ...Object.fromEntries(
          slotNames.flatMap((slot) => {
            const placed = items.success.flatMap(([into, item]) => (into === slot ? [item] : []));
            return placed.length === 0 ? [] : [[slot, placed] as const];
          }),
        ),
      },
    };
  return Result.succeed(block);
};

const blockType = (draft: Draft, target: Target, block: BlockId): BlockType | undefined =>
  (target === "site" ? draft.parts.blocks[block] : draft.pages[target]?.blocks[block])?.type;

/** The ops an agent's edits make on a page, or what's wrong with them, by the edit's position. */
export const toOps = (
  draft: Draft,
  contracts: BlockContracts,
  target: Target,
  edits: ReadonlyArray<AgentOp>,
): Result.Result<ReadonlyArray<Op>, ReadonlyArray<string>> => {
  const problems: Array<string> = [];
  const ops: Array<Op> = [];
  const structural = (index: number) => {
    problems.push(
      `op ${index + 1}: the header and footer can only have their fields, variant and surface changed.`,
    );
  };
  edits.forEach((edit, index) => {
    switch (edit.op) {
      case "setProp": {
        const type = blockType(draft, target, edit.block);
        const field: Field | undefined =
          type === undefined ? undefined : fieldAt(contracts.get(type)?.fields ?? {}, edit.path);
        const unset: Op = { op: "setProp", target, block: edit.block, path: edit.path };
        if (edit.value === undefined) {
          ops.push(unset);
          return;
        }
        if (field === undefined) {
          // The document module says the field doesn't exist.
          ops.push({ ...unset, value: edit.value });
          return;
        }
        const value = storedValue(field, edit.value, edit.path);
        if (Result.isFailure(value)) problems.push(`op ${index + 1}: ${describe(value.failure)}`);
        else
          ops.push({
            op: "setProp",
            target,
            block: edit.block,
            path: edit.path,
            value: value.success,
          });
        return;
      }
      case "setVariant":
        ops.push({ op: "setVariant", target, block: edit.block, variant: edit.variant });
        return;
      case "setSurface":
        ops.push({ op: "setSurface", target, block: edit.block, surface: edit.surface });
        return;
      case "insertBlock": {
        if (target === "site") return structural(index);
        const block = buildBlock(contracts, edit.block);
        if (Result.isFailure(block)) problems.push(`op ${index + 1}: ${block.failure}`);
        else
          ops.push({
            op: "insertBlock",
            page: target,
            list: edit.list,
            after: edit.after,
            block: block.success,
          });
        return;
      }
      case "moveBlock":
        if (target === "site") return structural(index);
        ops.push({
          op: "moveBlock",
          page: target,
          block: edit.block,
          list: edit.list,
          after: edit.after,
        });
        return;
      case "removeBlock":
        if (target === "site") return structural(index);
        ops.push({ op: "removeBlock", page: target, block: edit.block });
        return;
      case "setMeta":
        if (target === "site") return structural(index);
        ops.push({ op: "setMeta", page: target, field: edit.field, value: edit.value });
        return;
      case "setPath":
        if (target === "site") return structural(index);
        ops.push({ op: "setPath", page: target, path: edit.path });
        return;
    }
  });
  return problems.length > 0 ? Result.fail(problems) : Result.succeed(ops);
};

/** The media a value places, wherever it sits in it. */
const mediaIn = (value: Json): ReadonlyArray<MediaId> => {
  if (isMediaRef(value)) return [value.id];
  if (Array.isArray(value)) return value.flatMap((item: Json) => mediaIn(item));
  return isJsonObject(value) ? Object.values(value).flatMap((item) => mediaIn(item)) : [];
};

const valuesOf = (op: Op): ReadonlyArray<Json> => {
  switch (op.op) {
    case "setProp":
      return op.value === undefined ? [] : [op.value];
    case "insertBlock":
      return [
        op.block.props,
        ...Object.values(op.block.slots ?? {})
          .flat()
          .map((item) => item.props),
      ];
    case "setMeta":
      return op.value === undefined ? [] : [op.value];
    default:
      return [];
  }
};

/**
 * Images ops place that the draft doesn't already show. The agent reuses
 * images people added; it can't choose files of its own.
 */
export const unknownMedia = (draft: Draft, ops: ReadonlyArray<Op>) => {
  const known = new Set<string>([
    ...placeholderMedia.keys(),
    ...[draft.parts, ...Object.values(draft.pages)].flatMap((holder) =>
      Object.values(holder.blocks).flatMap((block) => mediaIn(block.props)),
    ),
  ]);
  return ops
    .flatMap(valuesOf)
    .flatMap(mediaIn)
    .filter((id) => !known.has(id));
};

/** Whether an op changes or removes the field someone is typing in. */
const overwrites = (draft: Draft, op: Op, field: TypingIn) => {
  switch (op.op) {
    case "setProp":
      return (
        field.target === op.target &&
        field.block === op.block &&
        (field.path === undefined || field.path[0] === op.path[0])
      );
    case "removeBlock": {
      const slots = draft.pages[op.page]?.blocks[op.block]?.slots ?? {};
      return (
        field.target === op.page &&
        (field.block === op.block ||
          Object.values(slots).some((items) => items.includes(field.block)))
      );
    }
    case "deletePage":
      return field.target === op.page;
    default:
      return false;
  }
};

/** People typing in fields the ops change or remove, which the agent leaves alone. */
export const typedOver = (draft: Draft, typing: ReadonlyArray<TypingIn>, ops: ReadonlyArray<Op>) =>
  ops.flatMap((op) =>
    typing
      .filter((field) => overwrites(draft, op, field))
      .map(
        (field) =>
          `${field.person.name} is typing in ${[field.block, ...(field.path ?? [])].join(" ")}. Leave it alone for now.`,
      ),
  );

/** Why the document module refused a batch, in words the agent can act on. */
export const describeErrors = (ops: ReadonlyArray<Op>, errors: ReadonlyArray<BatchError>) =>
  errors.map((error) => {
    const op = ops[error.op];
    const where = error.path.length === 0 ? "" : ` ${error.path.join(".")}`;
    return `op ${error.op + 1}${op === undefined ? "" : ` (${op.op})`}${where}: ${error.message}`;
  });

const blockTitle = (draft: Draft, contracts: BlockContracts, target: Target, block: BlockId) => {
  const type = blockType(draft, target, block);
  return type === undefined ? "section" : (contracts.get(type)?.title ?? type);
};

/** What ops did, in a line for the chat panel. `before` is the draft they applied to. */
export const describeOps = (
  before: Draft,
  contracts: BlockContracts,
  target: Target,
  ops: ReadonlyArray<Op>,
) => {
  const [first] = ops;
  if (first === undefined) return "Changed nothing";
  const where =
    target === "site"
      ? "the header and footer"
      : before.pages[target] === undefined
        ? "the page"
        : pageName(before.pages[target]);
  const title = (block: BlockId) => blockTitle(before, contracts, target, block);
  const line = (() => {
    switch (first.op) {
      case "setProp": {
        const type = blockType(before, target, first.block);
        const field =
          type === undefined ? undefined : fieldAt(contracts.get(type)?.fields ?? {}, first.path);
        return `Changed ${(field?.title ?? first.path.join(" ")).toLowerCase()} in the ${title(first.block)}`;
      }
      case "setVariant":
        return `Changed the layout of the ${title(first.block)}`;
      case "setSurface":
        return `Changed the background of the ${title(first.block)}`;
      case "insertBlock":
        return `Added a ${contracts.get(first.block.type)?.title ?? first.block.type}`;
      case "moveBlock":
        return `Moved the ${title(first.block)}`;
      case "removeBlock":
        return `Removed the ${title(first.block)}`;
      case "setMeta":
        return `Changed the ${first.field}`;
      case "setPath":
        return `Changed the address to ${first.path}`;
      case "createPage":
        return `Created the ${pageName(first.page)} page`;
      case "deletePage":
      case "rebase":
        return "Changed the draft";
    }
  })();
  const more =
    ops.length > 1 ? `, and ${ops.length - 1} more change${ops.length > 2 ? "s" : ""}` : "";
  // A new page is where the change is, so it isn't named twice.
  return first.op === "createPage" ? `${line}${more}` : `${line} on ${where}${more}`;
};

/** The block an op puts the agent at, for presence and the chat panel's "show on page". */
export const blockOfOp = (op: Op): BlockId | null => {
  switch (op.op) {
    case "setProp":
    case "setVariant":
    case "setSurface":
    case "moveBlock":
      return op.block;
    case "insertBlock":
      return op.block.id;
    default:
      return null;
  }
};
