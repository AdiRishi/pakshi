import type { BlockType } from "@repo/contracts/ids";
import type { Surface } from "@repo/tokens";

import type { Fields } from "./fields.ts";

/** A named list of item blocks inside a section, and the item types it accepts. */
export interface SlotSpec {
  readonly title: string;
  readonly accepts: readonly [BlockType, ...Array<BlockType>];
}

/**
 * Where a block goes. Sections sit at the top of a page, choose a surface and
 * may hold items in slots. Items sit in a section's slot and have neither. A
 * site's header and footer are one block each, shared by every page.
 */
export type Placement =
  | {
      readonly placement: "section";
      readonly surfaces: readonly [Surface, ...Array<Surface>];
      readonly slots: Readonly<Record<string, SlotSpec>>;
      /** Interactive blocks hydrate on the site, so they must be top-level sections. */
      readonly interactive: boolean;
    }
  | { readonly placement: "item" }
  | {
      readonly placement: "header" | "footer";
      readonly surfaces: readonly [Surface, ...Array<Surface>];
    };

/** What the editor, validation and the agent know about a block version, without its component. */
export type BlockContract = Placement & {
  readonly type: BlockType;
  readonly version: number;
  readonly title: string;
  readonly fields: Fields;
  readonly variants: ReadonlyArray<string>;
  readonly agent: { readonly purpose: string; readonly avoid?: ReadonlyArray<string> };
};
