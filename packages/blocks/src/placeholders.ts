import type { FormDefinition } from "@repo/contracts/form";
import {
  BlockId,
  type BlockType,
  FormFieldId,
  FormId,
  ItemId,
  MediaId,
  PageId,
  randomId,
} from "@repo/contracts/ids";
import type { BlockTree, PropPath } from "@repo/contracts/ops";
import type { CollectionKind } from "@repo/contracts/page";
import { FormRef, MediaRef, PageRef } from "@repo/contracts/references";
import type { PageListing } from "@repo/contracts/snapshot";
import { Equal, Schema } from "effect";
import type { Json } from "effect/Schema";

import type { ResolvedMedia, SiteEntry } from "./components.tsx";
import type { BlockContract } from "./contract.ts";
import type { Field, Fields } from "./fields.ts";

/*
 * Images, a form and a blog that every site can show, so a new block looks finished
 * before anyone has chosen its content. Block placeholders point at them by
 * these IDs. They're drafts' content only: a field still holding one is a
 * placeholder, which the checks block from publishing.
 *
 * The images are inline SVG, so they resolve the same way in Studio, `sites`
 * and tests without an asset pipeline.
 */

/** An image drawn inline as SVG, so it needs no file to load from. */
export const inlineSvg = (width: number, height: number, body: string): ResolvedMedia => ({
  src: `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${body}</svg>`,
  )}`,
  width,
  height,
});

const birds = (color: string, x: number, y: number) =>
  `<g fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round">` +
  `<path d="M${x} ${y}q22 -18 44 0q22 -18 44 0"/>` +
  `<path d="M${x + 130} ${y - 50}q16 -13 32 0q16 -13 32 0"/>` +
  `<path d="M${x + 60} ${y - 110}q12 -10 24 0q12 -10 24 0"/></g>`;

const hills = inlineSvg(
  1600,
  1067,
  `<defs><linearGradient id="s" x2="0" y2="1"><stop offset="0" stop-color="#F3E3CF"/>` +
    `<stop offset=".62" stop-color="#EBC7A6"/><stop offset="1" stop-color="#E0A884"/></linearGradient></defs>` +
    `<rect width="1600" height="1067" fill="url(#s)"/>` +
    `<circle cx="1130" cy="440" r="120" fill="#F8EFE3"/>` +
    `<path d="M0 640C220 560 380 600 560 560S920 470 1120 540 1460 600 1600 560V1067H0Z" fill="#CB9272"/>` +
    `<path d="M0 760C260 690 460 740 700 700S1120 640 1340 700 1540 730 1600 710V1067H0Z" fill="#9C6B57"/>` +
    `<path d="M0 880C300 820 520 860 820 830S1300 800 1600 850V1067H0Z" fill="#5E4B48"/>` +
    `<path d="M0 990C400 940 800 970 1200 950S1500 960 1600 955V1067H0Z" fill="#33302F"/>` +
    birds("#5E4B48", 420, 330),
);

const circles = inlineSvg(
  1200,
  1200,
  `<rect width="1200" height="1200" fill="#EAE3D6"/>` +
    `<path d="M1200 0V620A620 620 0 0 1 580 0Z" fill="#C9724F"/>` +
    `<path d="M0 1200V500A700 700 0 0 1 700 1200Z" fill="#2F5D62"/>` +
    `<circle cx="830" cy="820" r="170" fill="#8FA58A"/>` +
    `<rect x="760" y="1010" width="440" height="190" fill="#1F2A30"/>` +
    `<circle cx="330" cy="300" r="72" fill="#E0B25E"/>`,
);

const arch = inlineSvg(
  1200,
  1500,
  `<defs><linearGradient id="k" x2="0" y2="1"><stop offset="0" stop-color="#C9D8D3"/>` +
    `<stop offset="1" stop-color="#F0DCC4"/></linearGradient></defs>` +
    `<rect width="1200" height="1500" fill="#E9DBC7"/>` +
    `<path d="M300 1500V640A300 300 0 0 1 900 640V1500Z" fill="url(#k)"/>` +
    `<circle cx="600" cy="1010" r="96" fill="#F7EBDC"/>` +
    `<rect x="300" y="1010" width="600" height="490" fill="#5E8C8F"/>` +
    `<path d="M340 1080H520M620 1140H860M380 1210H600" stroke="#7FA6A7" stroke-width="10" stroke-linecap="round"/>` +
    `<path d="M300 1500V640A300 300 0 0 1 900 640V1500" fill="none" stroke="#D6C0A4" stroke-width="30"/>` +
    `<rect y="1340" width="1200" height="160" fill="#C4A286"/>` +
    birds("#7FA6A7", 470, 820),
);

const sea = inlineSvg(
  1600,
  900,
  `<defs><linearGradient id="h" x2="0" y2="1"><stop offset="0" stop-color="#DCE6E4"/>` +
    `<stop offset="1" stop-color="#F2E7D8"/></linearGradient></defs>` +
    `<rect width="1600" height="900" fill="url(#h)"/>` +
    `<path d="M0 560C200 520 380 540 520 530L800 545C1000 520 1200 536 1600 518V560H0Z" fill="#9FB4AF"/>` +
    `<rect y="560" width="1600" height="340" fill="#4F7C80"/>` +
    `<path d="M140 640H420M760 700H1120M300 780H700M1180 620H1460M980 830H1400" stroke="#6F9A9B" stroke-width="8" stroke-linecap="round"/>` +
    `<path d="M520 548V350L640 548Z" fill="#F7F1E8"/><path d="M508 556H650L628 582H532Z" fill="#2B3A3F"/>` +
    `<path d="M1090 552V440L1160 552Z" fill="#F7F1E8"/><path d="M1082 558H1166L1152 574H1096Z" fill="#2B3A3F"/>`,
);

/** A placeholder logo: a simple mark beside the word "Logo", in one ink. */
const logo = (mark: string) =>
  inlineSvg(
    480,
    120,
    `<g fill="#3A3A3A">${mark}<text x="140" y="78" font-family="system-ui, sans-serif" font-size="52" font-weight="600">Logo</text></g>`,
  );

/** The placeholder images, by the IDs placeholders use. */
export const placeholderMedia: ReadonlyMap<MediaId, ResolvedMedia> = new Map([
  [MediaId.make("med_pakshiHills"), hills],
  [MediaId.make("med_pakshiCircles"), circles],
  [MediaId.make("med_pakshiArch"), arch],
  [MediaId.make("med_pakshiSea"), sea],
  [MediaId.make("med_pakshiLogoCircle"), logo(`<circle cx="70" cy="60" r="40"/>`)],
  [
    MediaId.make("med_pakshiLogoSquare"),
    logo(`<rect x="32" y="22" width="76" height="76" rx="14"/>`),
  ],
  [MediaId.make("med_pakshiLogoTriangle"), logo(`<path d="M70 18L114 100H26Z"/>`)],
  [
    MediaId.make("med_pakshiLogoWave"),
    logo(
      `<path d="M24 76c15-32 31-32 46 0s31 32 46 0" fill="none" stroke="#3A3A3A" stroke-width="14" stroke-linecap="round"/>`,
    ),
  ],
]);

/** A contact form a new form section shows until someone chooses one of the site's forms. */
export const placeholderForm: FormDefinition = {
  id: FormId.make("frm_pakshiContact"),
  name: "Contact",
  submitLabel: "Send message",
  fields: [
    { kind: "shortText", id: FormFieldId.make("ff_name"), label: "Your name", required: true },
    { kind: "email", id: FormFieldId.make("ff_email"), label: "Email", required: true },
    { kind: "longText", id: FormFieldId.make("ff_message"), label: "Message", required: true },
  ],
};

/**
 * The blog a new listing shows until it's pointed at one of the site's own.
 * It isn't a page: it holds the sample posts, which link nowhere.
 */
export const placeholderCollection = PageId.make("pg_pakshiBlog");

const samplePost = (
  id: string,
  meta: Pick<SiteEntry["meta"], "title" | "excerpt" | "date" | "author"> & {
    readonly cover: MediaId;
  },
): SiteEntry => ({
  id: PageId.make(id),
  href: "#",
  meta: {
    ...meta,
    description: meta.excerpt,
    tags: [],
    cover: { $ref: "media", id: meta.cover, alt: "" },
  },
});

/** The placeholder blog's posts, newest first. */
export const samplePosts: readonly [SiteEntry, ...Array<SiteEntry>] = [
  samplePost("pg_pakshiPostPlans", {
    title: "Our plans for the year ahead",
    excerpt: "A short summary of the post goes here, so readers can decide whether to read on.",
    date: "2027-05-20",
    author: "Alex Morgan",
    cover: MediaId.make("med_pakshiHills"),
  }),
  samplePost("pg_pakshiPostSpring", {
    title: "What we learned this spring",
    excerpt: "Each post has a page of its own, with its title, date and author at the top.",
    date: "2027-04-08",
    author: "Sam Taylor",
    cover: MediaId.make("med_pakshiSea"),
  }),
  samplePost("pg_pakshiPostWelcome", {
    title: "A warm welcome to our new members",
    excerpt:
      "Choose one of your blogs for this list, and its posts show here as they're published.",
    date: "2027-02-14",
    author: "Alex Morgan",
    cover: MediaId.make("med_pakshiArch"),
  }),
];

const placeholderMediaIds: ReadonlySet<string> = new Set(placeholderMedia.keys());

type Props = Readonly<Record<string, Json>>;

const isJsonObject = Schema.is(Schema.JsonObject);
const isJsonArray = Schema.is(Schema.Array(Schema.Json));
const isMediaRef = Schema.is(MediaRef);
const isFormRef = Schema.is(FormRef);
const isPageRef = Schema.is(PageRef);
const isItemId = Schema.is(ItemId);

const valueAt = (value: Json | undefined, key: string): Json | undefined =>
  isJsonObject(value) ? value[key] : undefined;

/** A list item with a new ID, so a copy of example content never repeats one. */
export const withFreshId = (item: Json): Json =>
  isJsonObject(item) ? Object.assign({}, item, { id: randomId("it") }) : item;

/** A list field's items with new IDs. */
const withFreshItems = (fields: Fields, props: Props): Props =>
  Object.fromEntries(
    Object.entries(props).map(([name, value]) => [
      name,
      fields[name]?.kind === "list" && isJsonArray(value) ? value.map(withFreshId) : value,
    ]),
  );

const placeholderOf = (contracts: ReadonlyMap<BlockType, BlockContract>, type: BlockType) => {
  const contract = contracts.get(type);
  if (contract === undefined) throw new Error(`The lockfile pins no version of ${type}.`);
  if (contract.placement !== "section" && contract.placement !== "item")
    throw new Error(`A ${contract.title} can't be added to a page.`);
  return { contract, placeholder: contract.placeholder };
};

/**
 * A new block of this type, with its placeholder content and new IDs for it,
 * its items and their list items, as an insert carries it.
 */
export const placeholderTree = (
  contracts: ReadonlyMap<BlockType, BlockContract>,
  type: BlockType,
): BlockTree => {
  const { contract, placeholder } = placeholderOf(contracts, type);
  const { slots, ...block } = placeholder;
  const tree: BlockTree = {
    ...block,
    props: withFreshItems(contract.fields, block.props),
    id: BlockId.make(randomId("b")),
    type,
  };
  if (slots === undefined) return tree;
  return {
    ...tree,
    slots: Object.fromEntries(
      Object.entries(slots).map(([slot, items]) => [
        slot,
        items.map((item) => ({
          ...item,
          props: withFreshItems(placeholderOf(contracts, item.type).contract.fields, item.props),
          id: BlockId.make(randomId("b")),
        })),
      ]),
    ),
  };
};

/** Every placeholder value a block type's fields can hold: its own, and its items in sections' placeholders. */
const placeholderProps = (contracts: ReadonlyMap<BlockType, BlockContract>, type: BlockType) =>
  Array.from(contracts.values()).flatMap((contract): ReadonlyArray<Props> => {
    if (contract.placement !== "section" && contract.placement !== "item") return [];
    const items = Object.values(contract.placeholder.slots ?? {})
      .flat()
      .filter((item) => item.type === type)
      .map((item) => item.props);
    return contract.type === type ? [contract.placeholder.props, ...items] : items;
  });

/** The parts of one field's value, as paths below the field, that still hold placeholder content. */
const placeholdersIn = (
  field: Field,
  value: Json,
  placeholders: ReadonlyArray<Json | undefined>,
): ReadonlyArray<ReadonlyArray<string>> => {
  switch (field.kind) {
    case "media":
      return isMediaRef(value) && placeholderMediaIds.has(value.id) ? [[]] : [];
    case "form":
      return isFormRef(value) && value.id === placeholderForm.id ? [[]] : [];
    case "collection":
      return isPageRef(value) && value.id === placeholderCollection ? [[]] : [];
    case "number":
    case "choice":
    case "icon":
      // A setting, such as how many posts to show, or an icon: any value of it fits.
      return [];
    case "cta": {
      // A short label such as "Get started" can be real, so a button is a placeholder while its link is.
      const link = valueAt(value, "link");
      return placeholders.some((placeholder) => Equal.equals(valueAt(placeholder, "link"), link))
        ? [[]]
        : [];
    }
    case "list": {
      const placeholderItems = placeholders.flatMap((placeholder) =>
        isJsonArray(placeholder) ? placeholder : [],
      );
      return (isJsonArray(value) ? value : []).flatMap((item) => {
        const id = valueAt(item, "id");
        return isItemId(id)
          ? fieldsHoldingPlaceholders(field.item, item, placeholderItems).map((path) => [
              id,
              ...path,
            ])
          : [];
      });
    }
    case "text":
    case "richText":
    case "link":
      return placeholders.some((placeholder) => Equal.equals(placeholder, value)) ? [[]] : [];
  }
};

const fieldsHoldingPlaceholders = (
  fields: Fields,
  props: Json,
  placeholders: ReadonlyArray<Json | undefined>,
): ReadonlyArray<ReadonlyArray<string>> =>
  Object.entries(fields).flatMap(([name, field]) => {
    const value = valueAt(props, name);
    return value === undefined
      ? []
      : placeholdersIn(
          field,
          value,
          placeholders.map((placeholder) => valueAt(placeholder, name)),
        ).map((path) => [name, ...path]);
  });

/**
 * The fields of a placed block that still hold placeholder content, as prop
 * paths: a placeholder image, form or blog, a button still linking where its
 * placeholder does, or text, rich text or a link unchanged from a placeholder
 * of the block's type. A draft can't be published while
 * any remain.
 */
export const placeholderPaths = (
  contracts: ReadonlyMap<BlockType, BlockContract>,
  block: { readonly type: BlockType; readonly props: Props },
): ReadonlyArray<PropPath> => {
  const contract = contracts.get(block.type);
  if (contract === undefined) return [];
  return fieldsHoldingPlaceholders(
    contract.fields,
    block.props,
    placeholderProps(contracts, block.type),
  );
};

/**
 * The collection of `kind` a new listing on a page shows: the page itself
 * when it's a collection of that kind, or else the site's only collection of
 * that kind. With several to choose from, or none, it's null, and the
 * listing keeps the placeholder until someone chooses.
 */
export const collectionFor = (
  listings: ReadonlyArray<PageListing>,
  page: PageId,
  kind: CollectionKind,
): PageId | null => {
  const collections = listings.filter(
    (listing) => listing.type === "collection" && listing.kind === kind,
  );
  const [only, ...others] = collections;
  if (collections.some((collection) => collection.id === page)) return page;
  return only !== undefined && others.length === 0 ? only.id : null;
};

/**
 * A block with each of its collection fields that still shows the
 * placeholder pointed at the collection `pick` gives for the field's kind, if
 * it gives one.
 */
export const withCollections = (
  tree: BlockTree,
  contracts: ReadonlyMap<BlockType, BlockContract>,
  pick: (kind: CollectionKind) => PageId | null,
): BlockTree => {
  const fields = contracts.get(tree.type)?.fields ?? {};
  const props = Object.fromEntries(
    Object.entries(tree.props).map(([name, value]) => {
      const field = fields[name];
      const chosen =
        field?.kind === "collection" && isPageRef(value) && value.id === placeholderCollection
          ? pick(field.collectionKind)
          : null;
      return [name, chosen === null ? value : { $ref: "page", id: chosen }];
    }),
  );
  return { ...tree, props };
};
