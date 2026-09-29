import type { FormDefinition } from "@repo/contracts/form";
import {
  BlockId,
  type BlockType,
  FormFieldId,
  FormId,
  ItemId,
  MediaId,
  randomId,
} from "@repo/contracts/ids";
import type { BlockTree, PropPath } from "@repo/contracts/ops";
import { FormRef, MediaRef } from "@repo/contracts/references";
import { Equal, Schema } from "effect";
import type { Json } from "effect/Schema";

import type { ResolvedMedia } from "./components.tsx";
import type { BlockContract } from "./contract.ts";
import type { Field, Fields } from "./fields.ts";

/*
 * Images and a form that every site can show, so a new block looks finished
 * before anyone has chosen its content. Block placeholders point at them by
 * these IDs. They're drafts' content only: a field still holding one is a
 * placeholder, which pre-flight blocks from publishing.
 *
 * The images are inline SVG, so they resolve the same way in Studio, `sites`
 * and tests without an asset pipeline.
 */

const svg = (width: number, height: number, body: string): ResolvedMedia => ({
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

const hills = svg(
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

const circles = svg(
  1200,
  1200,
  `<rect width="1200" height="1200" fill="#EAE3D6"/>` +
    `<path d="M1200 0V620A620 620 0 0 1 580 0Z" fill="#C9724F"/>` +
    `<path d="M0 1200V500A700 700 0 0 1 700 1200Z" fill="#2F5D62"/>` +
    `<circle cx="830" cy="820" r="170" fill="#8FA58A"/>` +
    `<rect x="760" y="1010" width="440" height="190" fill="#1F2A30"/>` +
    `<circle cx="330" cy="300" r="72" fill="#E0B25E"/>`,
);

const arch = svg(
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

const sea = svg(
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

/** The placeholder images, by the IDs placeholders use. */
export const placeholderMedia: ReadonlyMap<MediaId, ResolvedMedia> = new Map([
  [MediaId.make("med_pakshiHills"), hills],
  [MediaId.make("med_pakshiCircles"), circles],
  [MediaId.make("med_pakshiArch"), arch],
  [MediaId.make("med_pakshiSea"), sea],
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

const placeholderMediaIds: ReadonlySet<string> = new Set(placeholderMedia.keys());

type Props = Readonly<Record<string, Json>>;

const isJsonObject = Schema.is(Schema.JsonObject);
const isJsonArray = Schema.is(Schema.Array(Schema.Json));
const isMediaRef = Schema.is(MediaRef);
const isFormRef = Schema.is(FormRef);
const isItemId = Schema.is(ItemId);

const valueAt = (value: Json | undefined, key: string): Json | undefined =>
  isJsonObject(value) ? value[key] : undefined;

/** A list field's items with new IDs, so a copy of placeholder content never repeats one. */
const withFreshItems = (fields: Fields, props: Props): Props =>
  Object.fromEntries(
    Object.entries(props).map(([name, value]) => [
      name,
      fields[name]?.kind === "list" && isJsonArray(value)
        ? value.map((item) =>
            isJsonObject(item) ? Object.assign({}, item, { id: randomId("it") }) : item,
          )
        : value,
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
 * paths: a placeholder image or form, a button still linking where its
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
