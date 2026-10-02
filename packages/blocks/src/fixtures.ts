import { noIdentity } from "@repo/contracts/brand";
import { Draft } from "@repo/contracts/draft";
import { FormDefinition } from "@repo/contracts/form";
import { BlockId, BlockType, FormId, MediaId, PageId } from "@repo/contracts/ids";
import type { BlockTree, Target } from "@repo/contracts/ops";
import { PageMeta, PagePath, PostMeta } from "@repo/contracts/page";
import { PublishedSettings } from "@repo/contracts/settings";
import { Menus } from "@repo/contracts/site";
import { type Lockfile, MediaFile } from "@repo/contracts/snapshot";
import { defaultTheme, resolveTheme } from "@repo/tokens";
import { Schema } from "effect";
import type { Json } from "effect/Schema";

import type { SiteData } from "./components.tsx";
import { BlockFixture, type BlockContract } from "./contract.ts";
import site from "./fixture-site.json" with { type: "json" };
import { fixtureFiles } from "./fixtures.gen.ts";
import { withFreshId } from "./placeholders.ts";
import { flattenTree, latestLockfile } from "./render.tsx";
import { sampleMedia } from "./sample-media.ts";
import { samples } from "./samples.gen.ts";
import { siteData } from "./site-data.ts";

/** Every fixture of every block version. */
export const blockFixtures = fixtureFiles.map((file) => ({
  type: BlockType.make(file.type),
  version: file.version,
  name: file.name,
  fixture: Schema.decodeUnknownSync(BlockFixture)(file.fixture),
}));

const pageEntryFields = { id: PageId, path: PagePath };

/**
 * The site that block fixtures refer to: its name and menus, the forms and
 * media their references point at, and pages and posts for links and blog
 * lists.
 */
export const FixtureSite = Schema.Struct({
  settings: PublishedSettings,
  menus: Menus,
  forms: Schema.Record(FormId, FormDefinition),
  media: Schema.Record(MediaId, MediaFile),
  pages: Schema.Array(
    Schema.Union([
      Schema.Struct({ ...pageEntryFields, type: Schema.Literal("page"), meta: PageMeta }),
      Schema.Struct({ ...pageEntryFields, type: Schema.Literal("post"), meta: PostMeta }),
    ]),
  ),
});

export const fixtureSite = Schema.decodeUnknownSync(FixtureSite)(site);

const isJsonArray = Schema.is(Schema.Array(Schema.Json));

const alphanumeric = (value: string) => value.replace(/[^A-Za-z0-9]/g, "");

/** Example content as a placed block with its items, whose IDs follow from `id`. */
const treeOf = (id: BlockId, type: BlockType, content: BlockFixture): BlockTree => {
  const { slots, ...fixture } = content;
  const tree: BlockTree = { ...fixture, id, type };
  if (slots === undefined) return tree;
  return {
    ...tree,
    slots: Object.fromEntries(
      Object.entries(slots).map(([slot, items]) => [
        slot,
        items.map((item, index) => ({ ...item, id: BlockId.make(`${id}${slot}${index}`) })),
      ]),
    ),
  };
};

/** A fixture as a placed block with its items, with IDs made from the block type and fixture name. */
export const fixtureTree = (entry: (typeof blockFixtures)[number]): BlockTree =>
  treeOf(
    BlockId.make(`b_${alphanumeric(entry.type)}${alphanumeric(entry.name)}`),
    entry.type,
    entry.fixture,
  );

const home = PageId.make("pg_home");

/**
 * A draft of the fixture site, with its forms, menus and pages, in the
 * default theme. Its home page holds `sections`, under `header` and above
 * `footer`; the site's other pages and posts are empty.
 */
export const fixtureDraft = (content: {
  readonly lockfile: Lockfile;
  readonly header: BlockTree;
  readonly footer: BlockTree;
  readonly sections: ReadonlyArray<BlockTree>;
}): Draft =>
  Schema.decodeSync(Draft)({
    id: "dr_fixtures",
    site: "site_fixtures",
    base: { release: "rel_fixtures", snapshot: "snap_fixtures" },
    revision: 0,
    parts: {
      header: content.header.id,
      footer: content.footer.id,
      blocks: Object.fromEntries([content.header, content.footer].flatMap(flattenTree)),
      menus: fixtureSite.menus,
    },
    forms: fixtureSite.forms,
    redirects: {},
    lockfile: content.lockfile,
    brand: {
      brand: "brand_fixtures",
      number: 1,
      theme: resolveTheme(defaultTheme).theme,
      identity: noIdentity,
    },
    pages: Object.fromEntries(
      fixtureSite.pages.map((page) => {
        const blocks = page.id === home ? content.sections : [];
        return [
          page.id,
          {
            ...page,
            schema: "pakshi.page/1",
            root: blocks.map((block) => block.id),
            blocks: Object.fromEntries(blocks.flatMap(flattenTree)),
          },
        ];
      }),
    ),
  });

/** Each block type's showcase sample, for its newest version, by type. */
export const blockSamples: ReadonlyMap<BlockType, BlockFixture> = new Map(
  Object.entries(samples).map(([type, sample]) => [
    BlockType.make(type),
    Schema.decodeSync(BlockFixture)(sample),
  ]),
);

const sampleOf = (type: BlockType) => {
  const sample = blockSamples.get(type);
  if (sample === undefined) throw new Error(`${type} has no sample.ts.`);
  return sample;
};

/** An image a showcase shows, as a site's library lists it. */
export interface ShowcaseImage {
  readonly id: MediaId;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

/** A draft that shows one block type's sample, with what renders or edits it. */
export interface BlockShowcase {
  /** The fixture site, with the sample on its home page, or as its header or footer. */
  readonly draft: Draft;
  readonly settings: PublishedSettings;
  /** Where the block to show is: the home page, or the site's header and footer. */
  readonly target: Target;
  /**
   * The block to show, with its items: the sample's own block, or for an
   * item, the section that holds it. Its ID is the block's in the draft.
   */
  readonly tree: BlockTree;
  /** The images samples show, which every showcase's library holds. */
  readonly media: ReadonlyArray<ShowcaseImage>;
  /** What the draft's blocks read beyond their props, for rendering it outside the editor. */
  readonly data: SiteData;
}

/** The address a showcase image loads from: the image itself, inline. */
export const showcaseMediaSrc = (id: MediaId) => {
  const image = sampleMedia.get(id);
  if (image === undefined) throw new Error(`${id} isn't a showcase image.`);
  return image.src;
};

const showcaseMedia: ReadonlyArray<ShowcaseImage> = Array.from(sampleMedia, ([id, image]) => ({
  id,
  alt: image.alt,
  width: image.width,
  height: image.height,
}));

/** The section type that holds an item type, whose sample shows the item. */
const holderOf = (contracts: ReadonlyMap<BlockType, BlockContract>, item: BlockType) => {
  const holder = Array.from(contracts.values()).find(
    (contract) =>
      contract.placement === "section" &&
      Object.values(contract.slots).some((slot) => slot.accepts.includes(item)),
  );
  if (holder === undefined) throw new Error(`No section holds ${item}.`);
  return holder.type;
};

/**
 * A throwaway draft of the fixture site that shows one block type's sample at
 * its newest version. A section goes alone on the home page, and an item in
 * its section's sample, because items only sit in a section. A header or
 * footer replaces the site's own. Every showcase's header and footer show
 * their samples.
 */
export const blockShowcase = (
  contracts: ReadonlyMap<BlockType, BlockContract>,
  type: BlockType,
): BlockShowcase => {
  const contract = contracts.get(type);
  if (contract === undefined) throw new Error(`No version of ${type} is loaded.`);
  const part = (type: "header" | "footer") =>
    treeOf(BlockId.make(`b_${type}`), type, sampleOf(type));
  const shown = contract.placement === "item" ? holderOf(contracts, type) : type;
  const block = treeOf(BlockId.make("b_showcase"), shown, sampleOf(shown));
  const sitewide = contract.placement === "header" || contract.placement === "footer";
  const draft = fixtureDraft({
    lockfile: latestLockfile,
    header: contract.placement === "header" ? block : part("header"),
    footer: contract.placement === "footer" ? block : part("footer"),
    sections: sitewide ? [] : [block],
  });
  return {
    draft,
    settings: fixtureSite.settings,
    target: sitewide ? "site" : home,
    tree: block,
    media: showcaseMedia,
    data: siteData({
      settings: fixtureSite.settings,
      identity: draft.brand.identity,
      menus: draft.parts.menus,
      pages: Object.values(draft.pages),
      forms: draft.forms,
      media: (id) => sampleMedia.get(id),
    }),
  };
};

/**
 * A new item for a block's list field, from its type's sample or else its
 * placeholder: the item at `index`, counting round when the list holds fewer,
 * with a new ID.
 */
export const placeholderItem = (contract: BlockContract, list: string, index: number) => {
  const listed = (props: Readonly<Record<string, Json>> | undefined) => {
    const value = props?.[list];
    return isJsonArray(value) ? value : [];
  };
  const sampled =
    latestLockfile[contract.type] === contract.version
      ? listed(blockSamples.get(contract.type)?.props)
      : [];
  const placeholders =
    contract.placement === "section" || contract.placement === "item"
      ? listed(contract.placeholder.props)
      : [];
  const items = sampled.length > 0 ? sampled : placeholders;
  const item = items[index % Math.max(items.length, 1)];
  if (item === undefined) throw new Error(`${contract.type} has no example ${list} to copy.`);
  return withFreshId(item);
};
