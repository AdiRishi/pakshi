import { richTextLines, RichTextDocument } from "@repo/blocks";
import type { Fields } from "@repo/blocks/fields";
import type { Draft } from "@repo/contracts/draft";
import type { BlockId, PageId } from "@repo/contracts/ids";
import type { Target } from "@repo/contracts/ops";
import type { BlockInstance, PageDocument } from "@repo/contracts/page";
import type { BlockContracts } from "@repo/domain/document";
import type { Surface } from "@repo/tokens";
import { Schema } from "effect";

import { agentProps } from "./content.ts";
import type { TypingIn } from "./workspace.ts";

/*
 * The draft as the agent reads it: an outline of every page, one line per
 * section, and a page's full content in the agent's form.
 */

type Json = Schema.Json;

const isRichText = Schema.is(RichTextDocument);
const isString = Schema.is(Schema.String);

/** A page's name, as people see it. */
export const pageName = (page: PageDocument) => page.meta.title || page.path;

/** A block's first line of text, to recognise it by. */
const firstText = (fields: Fields, props: Readonly<Record<string, Json>>) => {
  for (const [name, field] of Object.entries(fields)) {
    const value = props[name];
    if (field.kind === "text" && isString(value) && value.trim() !== "") return value;
    if (field.kind === "richText" && isRichText(value)) {
      const [line] = richTextLines(value).filter((text) => text.trim() !== "");
      if (line !== undefined) return line;
    }
  }
  return "";
};

const shorten = (text: string, length: number) =>
  text.length > length ? `${text.slice(0, length - 1)}…` : text;

const blockLine = (contracts: BlockContracts, id: BlockId, block: BlockInstance) => {
  const contract = contracts.get(block.type);
  const look = [block.variant, block.surface].filter((part) => part !== undefined).join(", ");
  const text = contract === undefined ? "" : firstText(contract.fields, block.props);
  return `${id} ${block.type} (${look})${text === "" ? "" : `: "${shorten(text, 60)}"`}`;
};

/** Every page of the draft and each section on it, one line each, with the header and footer first. */
export const outline = (draft: Draft, contracts: BlockContracts) => {
  const site = [draft.parts.header, draft.parts.footer].flatMap((id) => {
    const block = draft.parts.blocks[id];
    return block === undefined ? [] : [`  ${blockLine(contracts, id, block)}`];
  });
  const pages = Object.values(draft.pages)
    .toSorted((a, b) => a.path.localeCompare(b.path))
    .flatMap((page) => [
      `${page.id} ${page.type} ${page.path} "${pageName(page)}"${page.status === "unpublished" ? " (unpublished)" : ""}${page.recipe === undefined ? "" : ` recipe ${page.recipe}`}`,
      ...page.root.flatMap((id) => {
        const block = page.blocks[id];
        if (block === undefined) return [];
        const items = Object.entries(block.slots ?? {}).flatMap(([slot, ids]) =>
          ids.length === 0 ? [] : [`      ${slot}: ${ids.length} items`],
        );
        return [`  ${blockLine(contracts, id, block)}`, ...items];
      }),
    ]);
  return [
    "site (header and footer)",
    ...site,
    ...pages,
    `Forms: ${
      Object.entries(draft.forms)
        .map(([id, form]) => `${id} "${form.name}"`)
        .join(", ") || "none"
    }`,
  ].join("\n");
};

const typingNote = (typing: ReadonlyArray<TypingIn>, target: Target, block: BlockId) =>
  typing
    .filter((field) => field.target === target && field.block === block)
    .map((field) => ({
      field: field.path ?? [],
      person: field.person.name,
      note: "is typing here: leave it alone",
    }));

/** A placed block as the agent reads it, with its items and anyone typing in it. */
type BlockView = {
  readonly id: BlockId;
  readonly type: string;
  readonly variant: string;
  readonly props: Readonly<Record<string, Json>>;
  surface?: Surface;
  items?: Readonly<Record<string, ReadonlyArray<Json>>>;
  typing?: ReturnType<typeof typingNote>;
};

const blockView = (
  contracts: BlockContracts,
  holder: { readonly blocks: Readonly<Record<BlockId, BlockInstance>> },
  target: Target,
  id: BlockId,
  typing: ReadonlyArray<TypingIn>,
): Json => {
  const block = holder.blocks[id];
  if (block === undefined) return { id, missing: true };
  const contract = contracts.get(block.type);
  const fields = contract?.fields ?? {};
  const items = Object.fromEntries(
    Object.entries(block.slots ?? {}).map(([slot, ids]) => [
      slot,
      ids.map((item) => blockView(contracts, holder, target, item, typing)),
    ]),
  );
  const view: BlockView = {
    id,
    type: block.type,
    variant: block.variant,
    props: agentProps(fields, block.props),
  };
  if (block.surface !== undefined) view.surface = block.surface;
  if (Object.keys(items).length > 0) view.items = items;
  const typingHere = typingNote(typing, target, id);
  if (typingHere.length > 0) view.typing = typingHere;
  return view;
};

/**
 * A page as `get_page` gives it, with every section or the ones chosen, or
 * for "site", the header and footer with the menus, redirects and forms.
 */
export const pageView = (
  draft: Draft,
  contracts: BlockContracts,
  target: Target,
  blocks: ReadonlyArray<BlockId> | undefined,
  typing: ReadonlyArray<TypingIn>,
): Json | null => {
  // Models often send an empty list for "all of them".
  const chosen = (ids: ReadonlyArray<BlockId>) =>
    blocks === undefined || blocks.length === 0 ? ids : ids.filter((id) => blocks.includes(id));
  if (target === "site")
    return {
      target: "site",
      sections: chosen([draft.parts.header, draft.parts.footer]).map((id) =>
        blockView(contracts, draft.parts, "site", id, typing),
      ),
      menus: draft.parts.menus,
      redirects: draft.redirects,
      forms: Object.values(draft.forms),
    };
  const page = draft.pages[target];
  if (page === undefined) return null;
  return {
    id: page.id,
    type: page.type,
    path: page.path,
    status: page.status ?? "published",
    meta: page.meta,
    sections: chosen(page.root).map((id) => blockView(contracts, page, target, id, typing)),
  };
};

/** The page a block is on, or null when no page holds it. */
export const pageOf = (draft: Draft, block: BlockId): PageId | null =>
  Object.values(draft.pages).find((page) => block in page.blocks)?.id ?? null;
