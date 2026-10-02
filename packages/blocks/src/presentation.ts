import type { BlockType } from "@repo/contracts/ids";

import type { DefinedBlock, Declared } from "./block.tsx";
import type { BlockFixture, Placement } from "./contract.ts";
import type { Field, Fields, ItemFields } from "./fields.ts";
import { presentations as files } from "./presentation.gen.ts";

/*
 * How Studio, the editor and the agent name a block type and its parts to
 * people: plain words for a first-time visitor rather than a developer's.
 * Each type keeps its presentation in `src/<type>/presentation.ts`, outside
 * its released version folders, so the words can change after a release.
 * It's written against the type's newest version, whose field and variant
 * names the compiler checks it against.
 */

type AnyBlock = DefinedBlock<Fields, string, Placement["placement"]>;

type Names<F extends Fields> = keyof F & string;

/** The names of the fields in `F` that are `Condition`. */
type NamesWhere<F extends Fields, Condition> = {
  [K in Names<F>]: F[K] extends Condition ? K : never;
}[Names<F>];

type ItemFieldsOf<F extends Field> = F extends { readonly item: infer Item extends ItemFields }
  ? Item
  : never;

/** The fields that can name an item: text, a button's label, or an image's alt text. */
type TitleNames<F extends Fields> = NamesWhere<F, { readonly kind: "text" | "cta" | "media" }>;

type ListNames<F extends Fields> = NamesWhere<F, { readonly kind: "list" }>;

/** A field's name, or a list's name and one of its items' fields, as `questions.answer`. */
type FieldPath<F extends Fields> = {
  [K in Names<F>]:
    | K
    | (F[K] extends { readonly item: infer Item extends ItemFields }
        ? `${K}.${Names<Item>}`
        : never);
}[Names<F>];

/** What one layout is called, and what it does, in a sentence. */
export interface LayoutLabel {
  readonly label: string;
  readonly description: string;
}

/** How a field is shown, where the field's own title or an empty field doesn't say enough. */
export interface FieldLabel {
  /** Replaces the field's title everywhere it's named. */
  readonly label?: string;
  /** What to write there, shown in the field while it's empty, such as "Like Summer 2027". */
  readonly hint?: string;
}

/** How sentences name the items of a list, such as "Add a question" and "20 questions". */
export interface ItemNaming<TitleField extends string = string> {
  readonly singular: string;
  readonly plural: string;
  /** The field that names an item in a list of them: its text, its button's label or its image's alt text. */
  readonly titleField: TitleField;
}

type Variants<D extends AnyBlock> = Declared<D>["variant"];
type FieldsOf<D extends AnyBlock> = Declared<D>["fields"];

type Lists<F extends Fields> = [ListNames<F>] extends [never]
  ? { readonly lists?: never }
  : {
      readonly lists: {
        readonly [K in ListNames<F>]: ItemNaming<TitleNames<ItemFieldsOf<F[K]>>>;
      };
    };

/**
 * A block type's presentation, checked against its newest version `D`. Items
 * have no place of their own in the gallery, so they say how a section names
 * them instead of where the gallery puts them.
 */
export type Presentation<D extends AnyBlock> = {
  /** The block's name, such as "Page opening". */
  readonly name: string;
  /** What it is, in one line, such as "The big opening at the top of a page." */
  readonly summary: string;
  /** One sentence of advice on using it well. */
  readonly hint: string;
  readonly variants: { readonly [V in Variants<D>]: LayoutLabel };
  readonly fields?: { readonly [P in FieldPath<FieldsOf<D>>]?: FieldLabel };
  /** The optional fields a layout can't do without, such as the photo text sits over. */
  readonly needs?: {
    readonly [V in Variants<D>]?: ReadonlyArray<
      NamesWhere<FieldsOf<D>, { readonly optional: true }>
    >;
  };
} & Lists<FieldsOf<D>> &
  (Declared<D>["placement"] extends "item"
    ? { readonly item: ItemNaming<TitleNames<FieldsOf<D>>> }
    : {
        /** Where the gallery puts the block: in the order a page runs, header first. */
        readonly order: number;
      });

/**
 * Showcase content for a block type's newest version `D`: what the gallery and
 * the block's own page show, in the layout they start with. A section's
 * sample carries the items in its slots.
 */
export type BlockSample<D extends AnyBlock> = Omit<BlockFixture, "variant" | "props"> & {
  readonly variant: Variants<D>;
  readonly props: { readonly [K in Names<FieldsOf<D>>]?: BlockFixture["props"][string] };
};

/** A block type's presentation, as every block type has one. */
export interface BlockPresentation {
  readonly type: BlockType;
  readonly name: string;
  readonly summary: string;
  readonly hint: string;
  /** Where the gallery puts the block, or null for an item, which the gallery doesn't show. */
  readonly order: number | null;
  /** How a section names this item, or null for a block that isn't one. */
  readonly item: ItemNaming | null;
  readonly variants: Readonly<Record<string, LayoutLabel>>;
  /** Labels and hints by field path, as `heading` or `questions.answer`. */
  readonly fields: Readonly<Record<string, FieldLabel>>;
  readonly lists: Readonly<Record<string, ItemNaming>>;
  readonly needs: Readonly<Record<string, ReadonlyArray<string>>>;
}

/** What every block type's presentation file has, before its optional parts are filled in. */
interface PresentationFile {
  readonly name: string;
  readonly summary: string;
  readonly hint: string;
  readonly order?: number;
  readonly item?: ItemNaming;
  readonly variants: Readonly<Record<string, LayoutLabel>>;
  readonly fields?: Readonly<Record<string, FieldLabel | undefined>>;
  readonly lists?: Readonly<Record<string, ItemNaming>>;
  readonly needs?: Readonly<Record<string, ReadonlyArray<string> | undefined>>;
}

const defined = <T>(record: Readonly<Record<string, T | undefined>> | undefined) =>
  Object.fromEntries(
    Object.entries(record ?? {}).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, value] as const],
    ),
  );

const presentationOfFile = (type: BlockType, file: PresentationFile): BlockPresentation => ({
  type,
  name: file.name,
  summary: file.summary,
  hint: file.hint,
  order: file.order ?? null,
  item: file.item ?? null,
  variants: file.variants,
  fields: defined(file.fields),
  lists: file.lists ?? {},
  needs: defined(file.needs),
});

/** Every block type's presentation, by type. */
export const presentations: ReadonlyMap<BlockType, BlockPresentation> = new Map(
  Object.entries(files).map(([type, file]: [BlockType, PresentationFile]) => [
    type,
    presentationOfFile(type, file),
  ]),
);

/** A block type's presentation. Every block type in the registry has one. */
export const presentationOf = (type: BlockType) => {
  const presentation = presentations.get(type);
  if (presentation === undefined) throw new Error(`${type} has no presentation.ts.`);
  return presentation;
};

/** What a block's layout is called. Every variant of every registered version has a label. */
export const layoutOf = (type: BlockType, variant: string) => {
  const layout = presentationOf(type).variants[variant];
  if (layout === undefined) throw new Error(`${type}'s presentation doesn't name ${variant}.`);
  return layout;
};

/** The blocks the gallery shows, in the order a page runs: every type but items. */
export const galleryBlocks: ReadonlyArray<BlockPresentation & { readonly order: number }> =
  Array.from(presentations.values())
    .flatMap(({ order, ...presentation }) => (order === null ? [] : [{ ...presentation, order }]))
    .toSorted((a, b) => a.order - b.order);

const labelledItem = (item: ItemFields, labels: BlockPresentation["fields"], list: string) =>
  Object.fromEntries(
    Object.entries(item).map(([name, field]) => [
      name,
      { ...field, title: labels[`${list}.${name}`]?.label ?? field.title },
    ]),
  );

/** Fields with the titles a presentation gives them in place of their own. */
export const labelledFields = (fields: Fields, labels: BlockPresentation["fields"]): Fields =>
  Object.fromEntries(
    Object.entries(fields).map(([name, field]) => {
      const title = labels[name]?.label ?? field.title;
      return [
        name,
        field.kind === "list"
          ? { ...field, title, item: labelledItem(field.item, labels, name) }
          : { ...field, title },
      ];
    }),
  );
