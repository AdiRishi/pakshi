import { type BlockContract, type ItemNaming, presentations } from "@repo/blocks";
import type { Surface } from "@repo/tokens";

/*
 * How the editor names a block's parts in sentences: "Add an introduction",
 * "Question 2", "That's the most: 20 questions". The words come from each
 * block type's presentation; everything else is the same for every block.
 */

/** First words that take no "a" or "an": ones that already say how many, and "text", which isn't counted. */
const takesNoArticle = new Set(["a", "an", "the", "some", "more", "your", "text"]);

/**
 * A part's name as it follows "Add": "a photo", "an introduction", "opening
 * hours", "more detail".
 */
export const withArticle = (name: string) => {
  const lower = name.charAt(0).toLowerCase() + name.slice(1);
  const words = lower.split(/\s+/);
  const first = words[0] ?? "";
  const last = words.at(-1) ?? "";
  if (takesNoArticle.has(first) || (last.endsWith("s") && !last.endsWith("ss"))) return lower;
  return `${/^[aeiou]/.test(first) ? "an" : "a"} ${lower}`;
};

/** What a sentence calls a list's items when its block's presentation doesn't say. */
const unnamed: ItemNaming = { singular: "item", plural: "items", titleField: "" };

/** How sentences name the items of a block's list field, such as "question" and "questions". */
export const listNaming = (contract: BlockContract, list: string): ItemNaming =>
  presentations.get(contract.type)?.lists[list] ?? unnamed;

/** How sentences name an item block, such as "team member", from its type's presentation. */
export const itemNaming = (contract: BlockContract): ItemNaming =>
  presentations.get(contract.type)?.item ?? unnamed;

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** One item's name with its place in its list: "Question 2". */
export const itemLabel = (naming: ItemNaming, index: number) =>
  `${capitalized(naming.singular)} ${index + 1}`;

/** What adding an item says: "Add a question". */
export const addItemLabel = (naming: ItemNaming) => `Add ${withArticle(naming.singular)}`;

/** What a full list says: "That's the most: 20 questions". */
export const fullLabel = (naming: ItemNaming, max: number) =>
  `That's the most: ${max} ${max === 1 ? naming.singular : naming.plural}`;

/** Why the last items can't be removed: "Needs at least 2". */
export const fewestLabel = (min: number) => `Needs at least ${min}`;

/** What each background is called, the same on every block. */
export const surfaceNames: Readonly<Record<Surface, string>> = {
  default: "Plain",
  muted: "Soft",
  tint: "Brand tint",
  brand: "Brand color",
  accent: "Accent color",
  inverse: "Reversed",
};
