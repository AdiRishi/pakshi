import { type PageEntry, SiteDataProvider, siteData } from "@repo/blocks";
import type { Draft } from "@repo/contracts/draft";
import type { BlockId } from "@repo/contracts/ids";
import type { Target } from "@repo/contracts/ops";
import { useMemo } from "react";

import { TargetProvider, useEditorState, useServices } from "../context.tsx";

const holderOf = (draft: Draft, target: Target) =>
  target === "site" ? draft.parts : draft.pages[target];

/**
 * One placed block, rendered with the same component `sites` uses. It reads
 * only its own instance, so an edit re-renders only the blocks it touches;
 * items in a section's slots are blocks of their own.
 */
function BlockView(props: { readonly target: Target; readonly id: BlockId }) {
  const { definitions } = useServices();
  const block = useEditorState((state) => holderOf(state.view, props.target)?.blocks[props.id]);
  const slots = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(block?.slots ?? {}).map(([slot, items]) => [
          slot,
          items.map((item) => <BlockView key={item} target={props.target} id={item} />),
        ]),
      ),
    [block?.slots, props.target],
  );
  const rendered = useMemo(() => {
    if (block === undefined) return null;
    const definition = definitions.get(block.type);
    if (definition === undefined) throw new Error(`The lockfile pins no version of ${block.type}.`);
    return definition.render({
      id: props.id,
      props: block.props,
      variant: block.variant,
      surface: block.surface,
      slots,
    });
  }, [block, definitions, props.id, slots]);
  if (rendered === null) return null;
  if (!rendered.ok) throw new Error(`Block ${props.id} can't render: ${rendered.problem}`);
  return rendered.element;
}

const sameEntries = (a: ReadonlyArray<PageEntry>, b: ReadonlyArray<PageEntry>) =>
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
const usePageEntries = () =>
  useEditorState((state): ReadonlyArray<PageEntry> => Object.values(state.view.pages), sameEntries);

/** What blocks read beyond their props, from the draft as the person sees it. */
export const useDraftSiteData = () => {
  const { media, mediaSrc, settings } = useServices();
  const menus = useEditorState((state) => state.view.parts.menus);
  const forms = useEditorState((state) => state.view.forms);
  const identity = useEditorState((state) => state.view.brand.identity);
  const pages = usePageEntries();
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
