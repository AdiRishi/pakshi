import { presentations } from "@repo/blocks";
import type { BlockType } from "@repo/contracts/ids";
import { notFound } from "@tanstack/react-router";

/** A block page's params: an address naming no block type in the library is a page that doesn't exist. */
export const blockTypeParams = {
  parse: (params: { readonly blockType: string }) => {
    const presentation = presentations.get(params.blockType);
    if (presentation === undefined) throw notFound();
    return { blockType: presentation.type };
  },
  stringify: (params: { readonly blockType: BlockType }) => ({ blockType: params.blockType }),
};
