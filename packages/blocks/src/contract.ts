import { BlockType } from "@repo/contracts/ids";
import type { CollectionKind } from "@repo/contracts/page";
import { Surface } from "@repo/tokens";
import { Schema } from "effect";

import type { Fields } from "./fields.ts";

const Props = Schema.Record(Schema.String, Schema.Json);

/**
 * Example content for one block version, stored beside it in `fixtures/`. A
 * section's fixture carries the items in its slots.
 */
export const BlockFixture = Schema.Struct({
  variant: Schema.String,
  surface: Schema.optionalKey(Surface),
  props: Props,
  slots: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Array(Schema.Struct({ type: BlockType, variant: Schema.String, props: Props })),
    ),
  ),
});
export type BlockFixture = typeof BlockFixture.Type;

/** A named list of item blocks inside a section, and the item types it accepts. */
export interface SlotSpec {
  readonly title: string;
  readonly accepts: readonly [BlockType, ...Array<BlockType>];
}

/**
 * Where a block goes. Sections sit at the top of a page, choose a surface and
 * may hold items in slots. Items sit in a section's slot and have neither. A
 * site's header and footer are one block each, shared by every page.
 *
 * Sections and items can be added to a page, so they carry the placeholder
 * content a new one starts with: their `placeholder` fixture.
 */
export type Placement =
  | {
      readonly placement: "section";
      readonly surfaces: readonly [Surface, ...Array<Surface>];
      readonly slots: Readonly<Record<string, SlotSpec>>;
      /**
       * The kind of entry the section belongs on, such as a blog's posts, when
       * it shows the entry's own details; null when it goes on any page.
       */
      readonly entryOf: CollectionKind | null;
      readonly placeholder: BlockFixture;
    }
  | { readonly placement: "item"; readonly placeholder: BlockFixture }
  | {
      readonly placement: "header" | "footer";
      readonly surfaces: readonly [Surface, ...Array<Surface>];
    };

/** How the registry names one block version, such as `hero@2`. */
export const blockKey = (type: BlockType, version: number) => `${type}@${version}`;

/** A placed block's props as stored, before any version's schema reads them. */
export type StoredProps = Readonly<Record<string, Schema.Json>>;

/** What the editor, validation and the agent know about a block version, without its component. */
export type BlockContract = Placement & {
  readonly type: BlockType;
  readonly version: number;
  readonly title: string;
  readonly fields: Fields;
  readonly variants: ReadonlyArray<string>;
  readonly agent: { readonly purpose: string; readonly avoid?: ReadonlyArray<string> };
  /**
   * Turns the previous version's props into this version's, so content can
   * move up any number of versions. It's told the variant the content had in
   * the previous version too. A block's first version has none.
   */
  readonly migrate: ((previous: StoredProps, variant: string) => StoredProps) | null;
  /**
   * The previous version's variants that this version calls by another
   * name, which upgrading moves content onto. Variants it keeps aren't listed.
   */
  readonly renamedVariants: Readonly<Record<string, string>>;
  /**
   * What this version changes from the one before, in a sentence or two for
   * the editors deciding whether to adopt it. A block's first version has none.
   */
  readonly changes: string | null;
};
