import { latestLockfile, loadBlocks, renderBlock, SiteDataProvider, siteData } from "@repo/blocks";
import type { Placement } from "@repo/blocks";
import { blockFixtures, fixtureSite, fixtureTree, flattenTree } from "@repo/blocks/fixtures";
import { recipes } from "@repo/blocks/recipes";
import type { BrandIdentity } from "@repo/contracts/brand";
import type { BlockType, BrandId, MediaId } from "@repo/contracts/ids";
import { brandMediaBasePath, type MediaSummary } from "@repo/contracts/studio";
import { SiteFrame } from "@repo/editor";
import { type ColorScheme, type ResolvedTheme, themeCss } from "@repo/tokens";
import { use, useEffect, useMemo, useState } from "react";

import siteCss from "@repo/blocks/site.css?url";

/** The newest version of every block, loaded once for every preview. */
const definitions = loadBlocks(latestLockfile);

/** Sections in the order recipes put them on pages, hero first. */
const recipeOrder = Array.from(
  new Set(recipes.flatMap((recipe) => recipe.sections.map((section) => section.type))),
);
const rank = (block: { readonly type: BlockType }) => {
  const at = recipeOrder.indexOf(block.type);
  return at === -1 ? recipeOrder.length : at;
};

/**
 * The blocks a preview shows, at their newest versions: the first header
 * and footer fixture, and each section as a new one starts on a page.
 */
const usePreviewBlocks = () => {
  const loaded = use(definitions);
  return useMemo(() => {
    const latest = blockFixtures.filter((entry) => latestLockfile[entry.type] === entry.version);
    const of = (placement: Placement["placement"]) =>
      latest.filter((entry) => loaded.get(entry.type)?.placement === placement);
    const titled = (entry: (typeof latest)[number]) => ({
      type: entry.type,
      title: loaded.get(entry.type)?.title ?? entry.type,
      tree: fixtureTree(entry),
    });
    return {
      loaded,
      header: of("header").slice(0, 1).map(titled),
      footer: of("footer").slice(0, 1).map(titled),
      sections: of("section")
        .filter((entry) => entry.name === "placeholder")
        .map(titled)
        .toSorted((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title)),
    };
  }, [loaded]);
};

/** The section blocks a preview can show alone. */
export const usePreviewSections = () =>
  usePreviewBlocks().sections.map(({ type, title }) => ({ type, title }));

/** The address of an image in a brand's library. */
export const brandMediaSrc = (brand: BrandId, media: MediaId) =>
  `${brandMediaBasePath}/${brand}/${media}`;

const labelCss = `
.pakshi-preview-block { position: relative; }
.pakshi-preview-label {
  position: absolute; top: 12px; right: 12px; z-index: 1; padding: 2px 10px;
  border: 1px solid var(--border); border-radius: 999px;
  background: var(--background); color: var(--muted-foreground);
  font: 500 12px/1.6 system-ui, sans-serif;
}
`;

/**
 * Every block, or one section alone, in a theme that isn't saved yet: the
 * header, each section's starting content and the footer, as sites render
 * them.
 */
export function ThemePreview(props: {
  readonly brand: { readonly id: BrandId; readonly name: string };
  readonly theme: ResolvedTheme;
  readonly identity: BrandIdentity;
  readonly media: ReadonlyArray<MediaSummary>;
  readonly scheme: ColorScheme;
  /** The section to show alone, or null for every block. */
  readonly only: BlockType | null;
}) {
  const { loaded, header, footer, sections } = usePreviewBlocks();
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);
  const [height, setHeight] = useState(800);
  const data = useMemo(() => {
    const files = new Map(props.media.map((file) => [file.id, file]));
    return siteData({
      settings: { name: props.brand.name },
      identity: props.identity,
      menus: fixtureSite.menus,
      pages: fixtureSite.pages,
      forms: fixtureSite.forms,
      media: (id) => {
        const file = files.get(id);
        return file === undefined
          ? undefined
          : { src: brandMediaSrc(props.brand.id, id), width: file.width, height: file.height };
      },
    });
  }, [props.brand, props.identity, props.media]);
  const css = useMemo(() => themeCss(props.theme, props.scheme), [props.theme, props.scheme]);

  useEffect(() => {
    const body = frameDocument?.body;
    const Observer = frameDocument?.defaultView?.ResizeObserver;
    if (body === undefined || Observer === undefined) return;
    const observer = new Observer(() => setHeight(body.scrollHeight));
    observer.observe(body);
    return () => observer.disconnect();
  }, [frameDocument]);

  const shown = [
    ...(props.only === null ? header : []),
    ...sections.filter((section) => props.only === null || section.type === props.only),
    ...(props.only === null ? footer : []),
  ];
  return (
    <SiteFrame
      title={`Preview of the ${props.brand.name} theme`}
      siteCss={siteCss}
      themeCss={css}
      extraCss={labelCss}
      inert
      className="w-full rounded-md border"
      style={{ height }}
      onDocument={setFrameDocument}
    >
      <SiteDataProvider value={data}>
        {shown.map(({ title, tree }) => (
          <div key={tree.id} className="pakshi-preview-block">
            <span className="pakshi-preview-label">{title}</span>
            {renderBlock(loaded, Object.fromEntries(flattenTree(tree)), tree.id)}
          </div>
        ))}
      </SiteDataProvider>
    </SiteFrame>
  );
}
