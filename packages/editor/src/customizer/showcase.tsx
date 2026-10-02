import type { BlockId, BlockType } from "@repo/contracts/ids";
import type { Target } from "@repo/contracts/ops";
import { createContext, useContext } from "react";

import type { SiteContent } from "../canvas/site-content.ts";

/** The block a customizer shows, and what it found the block shows from the site. */
export interface Showcase {
  /** The type the customizer is about. An item shows inside the section that holds it. */
  readonly type: BlockType;
  readonly target: Target;
  /** The block on the page: the type's own, or for an item, its section. */
  readonly shown: BlockId;
  readonly siteContent: SiteContent | null;
  readonly setSiteContent: (content: SiteContent | null) => void;
  /** The element on the page whose site content is being explained, or null. */
  readonly explaining: Element | null;
  readonly explain: (element: Element | null) => void;
}

const ShowcaseContext = createContext<Showcase | null>(null);

export const ShowcaseProvider = ShowcaseContext.Provider;

export const useShowcase = () => {
  const showcase = useContext(ShowcaseContext);
  if (showcase === null) throw new Error("The customizer's parts render only inside it.");
  return showcase;
};
