import { galleryBlocks, latestLockfile, loadBlocks, renderTree, siteData } from "@repo/blocks";
import { blockFixtures, fixtureSite, fixtureTree } from "@repo/blocks/fixtures";
import type { BrandIdentity } from "@repo/contracts/brand";
import type { BlockType, BrandId } from "@repo/contracts/ids";
import { listingsOf } from "@repo/contracts/snapshot";
import type { MediaSummary } from "@repo/contracts/studio";
import { ScaledSiteFrame } from "@repo/editor";
import type { ColorScheme, ResolvedTheme } from "@repo/tokens";
import { use, useMemo } from "react";

import { brandMediaSrc } from "./brand-media";

import siteCss from "@repo/blocks/site.css?url";

/** The newest version of every block, loaded once for every preview. */
const definitions = loadBlocks(latestLockfile);

/**
 * The blocks a preview shows, at their newest versions and in the order a
 * page runs: the first header and footer fixture, and each section as a new
 * one starts on a page.
 */
const usePreviewBlocks = () => {
  const loaded = use(definitions);
  return useMemo(() => {
    const latest = blockFixtures.filter((entry) => latestLockfile[entry.type] === entry.version);
    return galleryBlocks.flatMap(({ type, name }) => {
      const section = loaded.get(type)?.placement === "section";
      const entry = latest.find(
        (candidate) => candidate.type === type && (!section || candidate.name === "placeholder"),
      );
      return entry === undefined ? [] : [{ type, title: name, section, tree: fixtureTree(entry) }];
    });
  }, [loaded]);
};

/** The section blocks a preview can show alone. */
export const usePreviewSections = () =>
  usePreviewBlocks().flatMap(({ type, title, section }) => (section ? [{ type, title }] : []));

/** Labels sized for a page scaled to about half its width. */
const labelCss = `
.pakshi-preview-block { position: relative; }
.pakshi-preview-label {
  position: absolute; top: 20px; right: 20px; z-index: 1; padding: 4px 16px;
  border: 1px solid var(--border); border-radius: 999px;
  background: var(--background); color: var(--muted-foreground);
  font: 500 20px/1.6 system-ui, sans-serif;
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
  const loaded = use(definitions);
  const blocks = usePreviewBlocks();
  const data = useMemo(() => {
    const files = new Map(props.media.map((file) => [file.id, file]));
    return siteData({
      settings: { name: props.brand.name, sharingImage: null },
      identity: props.identity,
      menus: fixtureSite.menus,
      pages: listingsOf(fixtureSite.pages),
      forms: fixtureSite.forms,
      media: (id) => {
        const file = files.get(id);
        return file === undefined
          ? undefined
          : { src: brandMediaSrc(props.brand.id, id), width: file.width, height: file.height };
      },
    });
  }, [props.brand, props.identity, props.media]);

  const shown = blocks.filter((block) =>
    props.only === null ? true : block.section && block.type === props.only,
  );
  return (
    <ScaledSiteFrame
      title={`Preview of the ${props.brand.name} theme`}
      siteCss={siteCss}
      theme={props.theme}
      scheme={props.scheme}
      data={data}
      extraCss={labelCss}
      className="rounded-md border"
    >
      {shown.map(({ title, tree }) => (
        <div key={tree.id} className="pakshi-preview-block">
          <span className="pakshi-preview-label">{title}</span>
          {renderTree(loaded, tree)}
        </div>
      ))}
    </ScaledSiteFrame>
  );
}
