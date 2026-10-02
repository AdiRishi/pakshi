import { SiteDataProvider, siteData } from "@repo/blocks";
import type { Draft } from "@repo/contracts/draft";
import type { BlockId, BlockType, PageId } from "@repo/contracts/ids";
import type { Target } from "@repo/contracts/ops";
import { listingsOf, type PageListing } from "@repo/contracts/snapshot";
import { type ReactNode, useMemo } from "react";

import { TargetProvider, useEditorState, useServices } from "../context.tsx";
import { type Ghost, ghosted, ghostSlotItem } from "../ghosts.ts";
import { GhostsProvider, useGhosting, useGhostPolicy } from "./ghost.tsx";

const holderOf = (draft: Draft, target: Target) =>
  target === "site" ? draft.parts : draft.pages[target];

/**
 * One placed block, rendered with the same component `sites` uses. It reads
 * only its own instance, so an edit re-renders only the blocks it touches;
 * items in a section's slots are blocks of their own. Where the canvas's
 * ghost policy says so, the block shows the parts it doesn't have.
 */
export function BlockView(props: { readonly target: Target; readonly id: BlockId }) {
  const { definitions, examples } = useServices();
  const policy = useGhostPolicy();
  const block = useEditorState((state) => holderOf(state.view, props.target)?.blocks[props.id]);
  const ghosting = useGhosting(props.target, props.id);
  const definition = block === undefined ? undefined : definitions.get(block.type);
  if (block !== undefined && definition === undefined)
    throw new Error(`The lockfile pins no version of ${block.type}.`);
  const shown = useMemo(
    () =>
      block === undefined || definition === undefined || ghosting === null
        ? { props: block?.props ?? {}, ghosts: noGhosts }
        : ghosted({
            contract: definition,
            target: props.target,
            block: props.id,
            props: block.props,
            ghosting,
            source: examples,
          }),
    [block, definition, ghosting, props.target, props.id, examples],
  );
  const addsToSlots =
    ghosting?.addItems === true && policy?.slotItems === true && props.target !== "site";
  const slots = useMemo(() => {
    const placed = block?.slots ?? {};
    const names =
      definition?.placement === "section" ? Object.keys(definition.slots) : Object.keys(placed);
    return Object.fromEntries(
      names.map((slot) => {
        const items = placed[slot] ?? [];
        const accepted = definition?.placement === "section" ? definition.slots[slot] : undefined;
        const [type] = accepted?.accepts ?? [];
        return [
          slot,
          [
            ...items.map((item) => <BlockView key={item} target={props.target} id={item} />),
            ...(addsToSlots && props.target !== "site" && type !== undefined
              ? [
                  <GhostSlotItem
                    key="ghost"
                    page={props.target}
                    section={props.id}
                    slot={slot}
                    type={type}
                    after={items.at(-1) ?? null}
                  />,
                ]
              : []),
          ],
        ];
      }),
    );
  }, [block?.slots, definition, addsToSlots, props.target, props.id]);
  const rendered = useMemo(() => {
    if (block === undefined || definition === undefined) return null;
    return definition.render({
      id: props.id,
      props: shown.props,
      variant: block.variant,
      surface: block.surface,
      slots,
    });
  }, [block, definition, props.id, shown.props, slots]);
  if (rendered === null) return null;
  if (!rendered.ok) throw new Error(`Block ${props.id} can't render: ${rendered.problem}`);
  return (
    <GhostsProvider block={props.id} ghosts={shown.ghosts} ghost={false}>
      {rendered.element}
    </GhostsProvider>
  );
}

const noGhosts: ReadonlyMap<string, Ghost> = new Map();

/** An item a slot doesn't have yet, whose first part is the button that adds it. */
function GhostSlotItem(props: {
  readonly page: PageId;
  readonly section: BlockId;
  readonly slot: string;
  readonly type: BlockType;
  readonly after: BlockId | null;
}) {
  const { definitions } = useServices();
  const { page, section, slot, type, after } = props;
  const ghost = useMemo(
    () => ghostSlotItem({ contracts: definitions, page, section, slot, type, after }),
    [definitions, page, section, slot, type, after],
  );
  const definition = definitions.get(type);
  const rendered = definition?.render({
    id: ghost.tree.id,
    props: ghost.tree.props,
    variant: ghost.tree.variant,
    surface: undefined,
    slots: {},
  });
  if (rendered === undefined || !rendered.ok)
    throw new Error(`A new ${type} can't render in ${section}.`);
  return (
    <GhostsProvider block={ghost.tree.id} ghosts={ghost.ghosts} ghost>
      {rendered.element}
    </GhostsProvider>
  );
}

const sameListings = (a: ReadonlyArray<PageListing>, b: ReadonlyArray<PageListing>) =>
  a.length === b.length &&
  a.every((entry, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      entry.id === other.id &&
      entry.path === other.path &&
      entry.meta === other.meta
    );
  });

/** The draft's pages as site data needs them. Only address and meta changes produce a new list. */
const usePageListings = () => useEditorState((state) => listingsOf(state.view.pages), sameListings);

/** What blocks read beyond their props, from the draft as the person sees it. */
export const useDraftSiteData = () => {
  const { media, mediaSrc, settings } = useServices();
  const menus = useEditorState((state) => state.view.parts.menus);
  const forms = useEditorState((state) => state.view.forms);
  const identity = useEditorState((state) => state.view.brand.identity);
  const pages = usePageListings();
  return useMemo(() => {
    const files = new Map(media.map((file) => [file.id, file]));
    return siteData({
      settings,
      identity,
      menus,
      pages,
      forms,
      media: (id) => {
        const file = files.get(id);
        return file === undefined
          ? undefined
          : { src: mediaSrc(id), width: file.width, height: file.height };
      },
    });
  }, [settings, identity, menus, pages, forms, media, mediaSrc]);
};

/** Part of the draft rendered on its own, such as a single block, with what blocks read from the site. */
export function SitePart(props: { readonly target: Target; readonly children: ReactNode }) {
  const data = useDraftSiteData();
  return (
    <SiteDataProvider value={data}>
      <TargetProvider value={props.target}>{props.children}</TargetProvider>
    </SiteDataProvider>
  );
}

/** The page being edited, with the site's header and footer, as `sites` lays it out. */
export function PageView() {
  const page = useEditorState((state) => state.page);
  const root = useEditorState((state) => state.view.pages[state.page]?.root);
  const parts = useEditorState((state) => state.view.parts);
  const data = useDraftSiteData();
  return (
    <SiteDataProvider value={data}>
      <TargetProvider value="site">
        <BlockView target="site" id={parts.header} />
      </TargetProvider>
      <TargetProvider value={page}>
        <main>
          {(root ?? []).map((id) => (
            <BlockView key={id} target={page} id={id} />
          ))}
        </main>
      </TargetProvider>
      <TargetProvider value="site">
        <BlockView target="site" id={parts.footer} />
      </TargetProvider>
    </SiteDataProvider>
  );
}
