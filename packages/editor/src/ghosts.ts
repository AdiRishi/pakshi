import { type BlockContract, type Field, placeholderTree } from "@repo/blocks";
import { type ExampleSource, exampleValue, placeholderItem } from "@repo/blocks/fixtures";
import type { BlockId, BlockType, PageId } from "@repo/contracts/ids";
import type { Op, PropPath, Target } from "@repo/contracts/ops";
import type { BlockContracts } from "@repo/domain/document";
import { Schema } from "effect";

import { addItemLabel, itemNaming, listNaming, withArticle } from "./naming.ts";

/*
 * Parts a block could have but doesn't, shown where they'd go. A block's
 * component renders an optional part only when it's set, and its released
 * code never changes, so the canvas renders the block with an example value
 * in each missing part: a ghost. The field components see that the draft has
 * nothing there, and draw a dashed "Add" button in the part's place instead.
 * A list gets a ghost item after its last, whose first part is an "Add a
 * question" button and whose other parts draw nothing; a slot gets a ghost
 * item block the same way.
 */

type Props = Readonly<Record<string, Schema.Json>>;

/** Which missing parts of a block show. */
export interface Ghosting {
  /** The block's own optional parts. */
  readonly parts: boolean;
  /** The list items, by ID, whose optional parts show. */
  readonly items: ReadonlySet<string>;
  /** Whether each list ends with a way to add an item. */
  readonly addItems: boolean;
}

export const sameGhosting = (a: Ghosting | null, b: Ghosting | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.parts === b.parts &&
    a.addItems === b.addItems &&
    a.items.size === b.items.size &&
    Array.from(a.items).every((id) => b.items.has(id)));

/** What a part the draft doesn't have draws in its place. */
export type Ghost =
  | {
      readonly kind: "add";
      /** What the button says, such as "Add an introduction". */
      readonly label: string;
      /** The ops that add the part, with the example it showed. */
      readonly ops: ReadonlyArray<Op>;
      /** The part to select once it's added. */
      readonly select: { readonly block: BlockId; readonly path: PropPath };
    }
  /** Another part of a ghost item, which draws nothing. */
  | { readonly kind: "hidden" };

/** The kinds of part drawn by a field component, which can stand in the canvas as a ghost. */
const drawn: ReadonlySet<Field["kind"]> = new Set(["text", "richText", "media", "cta"]);

const pathKey = (path: ReadonlyArray<string>) => path.join(".");

const isObject = Schema.is(Schema.JsonObject);
const isItem = Schema.is(Schema.Struct({ id: Schema.String }));

/** A block's props with ghosts in its missing parts, and what each ghost draws, by path. */
export interface Ghosted {
  readonly props: Props;
  readonly ghosts: ReadonlyMap<string, Ghost>;
}

/** The parts of an item, as `[name, field]`, with the first drawn one an item's ghost turns into its button. */
const firstDrawn = (fields: Readonly<Record<string, Field>>, item: Props) =>
  Object.entries(fields).find(
    ([name, field]) => drawn.has(field.kind) && item[name] !== undefined,
  )?.[0];

/** A block's props with ghosts in the parts `ghosting` shows. */
export const ghosted = (input: {
  readonly contract: BlockContract;
  readonly target: Target;
  readonly block: BlockId;
  readonly props: Props;
  readonly ghosting: Ghosting;
  readonly source: ExampleSource;
}): Ghosted => {
  const { contract, target, block, ghosting, source } = input;
  const ghosts = new Map<string, Ghost>();
  const setProp = (path: PropPath, value: Schema.Json): Op => ({
    op: "setProp",
    target,
    block,
    path,
    value,
  });
  const props = new Map(Object.entries(input.props));
  for (const [name, field] of Object.entries(contract.fields)) {
    const value = props.get(name);
    if (field.kind === "list") {
      const items = Array.isArray(value) ? value : [];
      const shown = items.map((item) => {
        if (!isObject(item) || !isItem(item) || !ghosting.items.has(item.id)) return item;
        const filled = new Map(Object.entries(item));
        for (const [part, itemField] of Object.entries(field.item)) {
          if (!itemField.optional || !drawn.has(itemField.kind) || item[part] !== undefined)
            continue;
          const example = exampleValue(contract, [name, part], source);
          const path = [name, item.id, part];
          filled.set(part, example);
          ghosts.set(pathKey(path), {
            kind: "add",
            label: `Add ${withArticle(itemField.title)}`,
            ops: [setProp(path, example)],
            select: { block, path },
          });
        }
        return Object.fromEntries(filled);
      });
      if (ghosting.addItems && items.length < field.max) {
        const ghost = placeholderItem(contract, name, items.length, source);
        const parts = isObject(ghost) && isItem(ghost) ? ghost : { id: "" };
        const first = firstDrawn(field.item, parts);
        for (const part of Object.keys(field.item)) {
          const path = [name, parts.id, part];
          ghosts.set(
            pathKey(path),
            part === first
              ? {
                  kind: "add",
                  label: addItemLabel(listNaming(contract, name)),
                  ops: [setProp([name], [...items, ghost])],
                  select: { block, path },
                }
              : { kind: "hidden" },
          );
        }
        props.set(name, [...shown, ghost]);
      } else props.set(name, shown);
      continue;
    }
    if (!ghosting.parts || !field.optional || !drawn.has(field.kind) || value !== undefined)
      continue;
    const example = exampleValue(contract, [name], source);
    props.set(name, example);
    ghosts.set(name, {
      kind: "add",
      label: `Add ${withArticle(field.title)}`,
      ops: [setProp([name], example)],
      select: { block, path: [name] },
    });
  }
  return { props: Object.fromEntries(props), ghosts };
};

/** A ghost item at the end of a section's slot: a new item block, and what its parts draw. */
export const ghostSlotItem = (input: {
  readonly contracts: BlockContracts;
  readonly page: PageId;
  readonly section: BlockId;
  readonly slot: string;
  readonly type: BlockType;
  readonly after: BlockId | null;
}) => {
  const contract = input.contracts.get(input.type);
  if (contract === undefined) throw new Error(`The lockfile pins no version of ${input.type}.`);
  const tree = placeholderTree(input.contracts, input.type);
  const first = firstDrawn(contract.fields, tree.props);
  if (first === undefined) throw new Error(`${input.type} has no part drawn on the page.`);
  const add: Ghost = {
    kind: "add",
    label: addItemLabel(itemNaming(contract)),
    ops: [
      {
        op: "insertBlock",
        page: input.page,
        list: { block: input.section, slot: input.slot },
        after: input.after,
        block: tree,
      },
    ],
    select: { block: tree.id, path: [first] },
  };
  return {
    tree,
    ghosts: new Map<string, Ghost>(
      Object.keys(contract.fields).map((name) => [name, name === first ? add : { kind: "hidden" }]),
    ),
  };
};
