import { Schema } from "effect";

import { BlockId, MenuItemId } from "./ids.ts";
import { BlockInstance } from "./page.ts";
import { Link } from "./references.ts";

const MenuLabel = Schema.String.check(Schema.isMaxLength(40));

const MenuLink = Schema.Struct({ id: MenuItemId, label: MenuLabel, target: Link });

/** A link in a menu. Main menu items can hold one level of children; footer items can't. */
export const MenuItem = Schema.Struct({
  ...MenuLink.fields,
  children: Schema.optionalKey(Schema.Array(MenuLink)),
});
export type MenuItem = typeof MenuItem.Type;

export const Menus = Schema.Struct({
  main: Schema.Array(MenuItem),
  footer: Schema.Array(MenuLink),
});
export type Menus = typeof Menus.Type;

/**
 * The parts of a site that every page shares: one header block, one footer
 * block and the two menus. The header and footer are block instances like any
 * other, so edit operations address them by block ID in `blocks`.
 */
export const SiteParts = Schema.Struct({
  header: BlockId,
  footer: BlockId,
  blocks: Schema.Record(BlockId, BlockInstance),
  menus: Menus,
}).check(
  Schema.makeFilter((parts) => {
    const ids = Object.keys(parts.blocks);
    const expected = [parts.header, parts.footer];
    if (parts.header === parts.footer) return "The header and footer need their own blocks";
    if (ids.length !== 2 || !expected.every((id) => ids.includes(id)))
      return "Site parts hold exactly the header and footer blocks";
    return expected.every((id) => parts.blocks[id]?.surface !== undefined)
      ? undefined
      : "The header and footer need a surface";
  }),
);
export type SiteParts = typeof SiteParts.Type;
