import { type BlockContract, type Field, richTextLines, type SlotSpec } from "@repo/blocks";
import { exampleValue } from "@repo/blocks/fixtures";
import type { Draft } from "@repo/contracts/draft";
import type { BlockId, BlockType, PageId } from "@repo/contracts/ids";
import type { Target } from "@repo/contracts/ops";
import type { Link } from "@repo/contracts/references";
import { Button } from "@repo/ui/components/button";
import { cn } from "cn";
import { Option, Predicate, Schema } from "effect";
import {
  ImageIcon,
  LayersIcon,
  LayoutGridIcon,
  LinkIcon,
  ListIcon,
  LockIcon,
  type LucideIcon,
  PilcrowIcon,
  PlusIcon,
  RectangleHorizontalIcon,
  TypeIcon,
} from "lucide-react";
import { type ReactNode, useId } from "react";

import { useCanvasControls } from "../canvas/controls.tsx";
import { blockElement, fieldElement } from "../canvas/regions.ts";
import {
  type FieldTarget,
  useEditorState,
  useEditorUi,
  useServices,
  useStore,
} from "../context.tsx";
import { addListItem, listIds, listRoom } from "../lists.ts";
import {
  addItemLabel,
  fullLabel,
  itemLabel,
  itemNaming,
  listNaming,
  withArticle,
} from "../naming.ts";
import { valueAt } from "../settings/controls.tsx";
import type { EditorState } from "../store.ts";
import { insertOp } from "../structure.ts";
import { useShowcase } from "./showcase.tsx";

/*
 * Everything in the block, one row per part in the order its definition has
 * them, each saying what it holds now. A row picks its part on the block, and
 * is the only way to reach a part with nothing to click, such as a logo's
 * link. A list's items sit under it, and the one pointed at or selected
 * opens to show its own parts.
 */

type Props = Readonly<Record<string, Schema.Json>>;

const holderOf = (draft: Draft, target: Target) =>
  target === "site" ? draft.parts : draft.pages[target];

const icons: Readonly<Record<Field["kind"], LucideIcon>> = {
  text: TypeIcon,
  richText: PilcrowIcon,
  media: ImageIcon,
  cta: RectangleHorizontalIcon,
  link: LinkIcon,
  form: LayersIcon,
  list: ListIcon,
};

/** The kinds of part drawn on the block, which a row picks there. */
const drawn: ReadonlySet<Field["kind"]> = new Set(["text", "richText", "media", "cta", "form"]);

interface Summary {
  readonly text: string;
  readonly warning: boolean;
}

const plain = (text: string): Summary => ({ text, warning: false });

const unfinished = (text: string): Summary => ({ text, warning: true });

/** A value read with its field's schema and summed up, or nothing when it doesn't read. */
const read = <A,>(schema: Schema.Decoder<A>, value: Schema.Json, summary: (held: A) => Summary) =>
  Option.match(Schema.decodeOption(schema)(value), {
    onNone: () => plain(""),
    onSome: summary,
  });

/** What a part holds now, in a few words. */
const summaryOf = (field: Field, value: Schema.Json | undefined, draft: Draft): Summary => {
  if (value === undefined) return plain(field.optional ? "Not shown" : "Empty");
  switch (field.kind) {
    case "text":
      return read(field.draft, value, (text) => (text === "" ? unfinished("Empty") : plain(text)));
    case "richText":
      return read(field.draft, value, (document) => {
        const line = richTextLines(document).find((text) => text.trim() !== "");
        return line === undefined ? unfinished("Empty") : plain(line);
      });
    case "media":
      return read(field.draft, value, (image) =>
        image.alt === undefined || image.alt === ""
          ? unfinished("Needs a description")
          : plain(image.alt),
      );
    case "cta":
      return read(field.draft, value, (button) =>
        button.label === "" ? unfinished("No words yet") : plain(button.label),
      );
    case "link":
      return read(field.draft, value, (link) => plain(`Goes to ${destination(link, draft)}`));
    case "form":
      return read(field.draft, value, (form) => plain(draft.forms[form.id]?.name ?? "A form"));
    case "list":
      return plain("");
  }
};

/** Where a link goes, as people say it: a page's name, or a web address without "https://". */
const destination = (link: Link, draft: Draft) => {
  if (Predicate.isString(link)) return link.replace(/^https:\/\//, "");
  const page = draft.pages[link.id];
  if (page === undefined) return "a page on the site";
  return page.path === "/" ? "the home page" : `the ${page.meta.title} page`;
};

function Row(props: {
  readonly icon: LucideIcon | null;
  readonly label: string;
  readonly summary?: Summary | undefined;
  readonly count?: string | undefined;
  readonly active: boolean;
  readonly onPick: (row: HTMLButtonElement) => void;
  readonly action?: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <li className="flex items-center gap-2">
      <button
        type="button"
        className={cn(
          "flex min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          props.active && "bg-accent hover:bg-accent",
          Icon === null && "py-1.5 pl-11",
        )}
        onClick={(event) => props.onPick(event.currentTarget)}
      >
        {Icon !== null && (
          <span
            aria-hidden
            className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-muted text-secondary-foreground [&_svg]:size-3.5"
          >
            <Icon />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("text-sm", Icon !== null && "font-medium")}>{props.label}</span>
          {props.summary !== undefined && props.summary.text !== "" && (
            <span
              className={cn(
                "truncate text-xs",
                props.summary.warning
                  ? "font-medium text-warning-foreground"
                  : "text-muted-foreground",
              )}
            >
              {props.summary.text}
            </span>
          )}
        </span>
        {props.count !== undefined && (
          <span className="mt-0.5 text-xs text-muted-foreground">{props.count}</span>
        )}
      </button>
      {props.action}
    </li>
  );
}

const isFocusable = (element: Element): element is Element & HTMLOrSVGElement => "focus" in element;

/** Picks a part on the block: its words to type in, or the popover it opens. */
const usePick = () => {
  const store = useStore();
  const ui = useEditorUi();
  const { document } = useCanvasControls();
  return (field: FieldTarget, kind: Field["kind"], row: HTMLButtonElement) => {
    if (kind === "link") return ui.openLink(field, row);
    store.select({ kind: "field", ...field });
    // The part is on the page once the selection has rendered, as a newly added one is.
    requestAnimationFrame(() => {
      const root = document === null ? null : blockElement(document, field.block);
      const element = root === null ? undefined : fieldElement(root, field.path);
      if (element === undefined || !isFocusable(element)) return;
      element.scrollIntoView({ block: "nearest" });
      if (kind === "media") ui.openMedia(field, element);
      else if (kind === "form") ui.openForm(field, element);
      else element.focus();
    });
  };
};

/** Whether a field is under the pointer or selected. */
const isActive = (state: EditorState, field: FieldTarget) => {
  const same = (block: BlockId, path: ReadonlyArray<string> | null) =>
    block === field.block && path !== null && path.join(".") === field.path.join(".");
  const { pointed, selection } = state;
  return (
    (pointed !== null && same(pointed.block, pointed.path)) ||
    (selection?.kind === "field" && same(selection.block, selection.path))
  );
};

/** A row for each of some fields of a block or of one of its list items. */
function FieldRows(props: {
  readonly target: Target;
  readonly block: BlockId;
  readonly contract: BlockContract;
  readonly fields: ReadonlyArray<readonly [string, Field]>;
  readonly props: Props;
  /** The list and item the fields belong to, or none for the block's own. */
  readonly within: readonly [string, string] | readonly [];
}) {
  const store = useStore();
  const { examples } = useServices();
  const pick = usePick();
  const draft = useEditorState((state) => state.view);
  const state = useEditorState((current) => current);
  return props.fields.map(([name, field]) => {
    if (field.kind === "list")
      return (
        <ListRows
          key={name}
          target={props.target}
          block={props.block}
          contract={props.contract}
          name={name}
          field={field}
          props={props.props}
        />
      );
    const path = [...props.within, name];
    const target = { target: props.target, block: props.block, path };
    const value = valueAt(props.props, path);
    const [list, item] = props.within;
    const addable =
      value === undefined && field.optional && (drawn.has(field.kind) || field.kind === "link");
    return (
      <Row
        key={name}
        icon={icons[field.kind]}
        label={field.title}
        summary={summaryOf(field, value, draft)}
        active={isActive(state, target)}
        onPick={(row) => pick(target, field.kind, row)}
        action={
          addable ? (
            <Button
              variant="outline"
              size="xs"
              aria-label={`Add ${withArticle(field.title)}`}
              onClick={(event) => {
                if (field.kind === "link") return pick(target, field.kind, event.currentTarget);
                const example = exampleValue(
                  props.contract,
                  list === undefined || item === undefined ? [name] : [list, name],
                  examples,
                );
                if (store.run([{ op: "setProp", ...target, value: example }]).length === 0)
                  pick(target, field.kind, event.currentTarget);
              }}
            >
              Add
            </Button>
          ) : undefined
        }
      />
    );
  });
}

/** A list field's row, with its items under it and a way to add one. */
function ListRows(props: {
  readonly target: Target;
  readonly block: BlockId;
  readonly contract: BlockContract;
  readonly name: string;
  readonly field: Extract<Field, { readonly kind: "list" }>;
  readonly props: Props;
}) {
  const store = useStore();
  const { examples } = useServices();
  const pick = usePick();
  const draft = useEditorState((state) => state.view);
  const state = useEditorState((current) => current);
  const naming = listNaming(props.contract, props.name);
  const ids = listIds(props.props, props.name);
  const room = listRoom(props.field, ids.length);
  const titled = props.field.item[naming.titleField];
  const firstPart = Object.entries(props.field.item).find(([, field]) => drawn.has(field.kind));
  const pickItem = (id: string, row: HTMLButtonElement) => {
    if (firstPart !== undefined)
      pick(
        { target: props.target, block: props.block, path: [props.name, id, firstPart[0]] },
        firstPart[1].kind,
        row,
      );
  };
  const { pointed, selection } = state;
  const openItems = new Set([
    ...(pointed?.block === props.block && pointed.item?.list === props.name
      ? [pointed.item.id]
      : []),
    ...(selection?.kind === "field" &&
    selection.block === props.block &&
    selection.path.length >= 3 &&
    selection.path[0] === props.name
      ? [selection.path[1]]
      : []),
  ]);
  return (
    <>
      <Row
        icon={ListIcon}
        label={props.field.title}
        count={`${ids.length} of ${props.field.max}`}
        active={false}
        onPick={(row) => {
          const [first] = ids;
          if (first !== undefined) pickItem(first, row);
        }}
      />
      {ids.map((id, index) => {
        const title =
          titled === undefined
            ? undefined
            : summaryOf(titled, valueAt(props.props, [props.name, id, naming.titleField]), draft)
                .text;
        const open = openItems.has(id);
        return (
          <li key={id} className="flex flex-col">
            <ul className="flex flex-col">
              <Row
                icon={null}
                label={title === undefined || title === "" ? itemLabel(naming, index) : title}
                active={open}
                onPick={(row) => pickItem(id, row)}
              />
            </ul>
            {open && (
              <ul className="ml-9 flex flex-col border-l pl-2">
                <FieldRows
                  target={props.target}
                  block={props.block}
                  contract={props.contract}
                  fields={Object.entries(props.field.item)}
                  props={props.props}
                  within={[props.name, id]}
                />
              </ul>
            )}
          </li>
        );
      })}
      <li className="pl-11">
        {room.canAdd ? (
          <Button
            variant="link"
            size="sm"
            className="h-7 px-0"
            onClick={(event) => {
              const added = addListItem({
                target: props.target,
                block: props.block,
                props: props.props,
                list: props.name,
                contract: props.contract,
                source: examples,
              });
              if (added !== undefined && store.run([added.op]).length === 0)
                pickItem(added.id, event.currentTarget);
            }}
          >
            <PlusIcon />
            {addItemLabel(naming)}
          </Button>
        ) : (
          <p className="py-1 text-xs text-muted-foreground">{fullLabel(naming, props.field.max)}</p>
        )}
      </li>
    </>
  );
}

/** A section's slot, with its item blocks under it and a way to add one. */
function SlotRows(props: {
  readonly page: PageId;
  readonly section: BlockId;
  readonly slot: string;
  readonly spec: SlotSpec;
}) {
  const store = useStore();
  const ui = useEditorUi();
  const { definitions } = useServices();
  const draft = useEditorState((state) => state.view);
  const state = useEditorState((current) => current);
  const page = draft.pages[props.page];
  const items = page?.blocks[props.section]?.slots?.[props.slot] ?? [];
  const [type] = props.spec.accepts;
  const itemContract = definitions.get(type);
  if (page === undefined || itemContract === undefined) return null;
  const naming = itemNaming(itemContract);
  const select = (block: BlockId) => {
    store.select({ kind: "block", target: props.page, block });
    ui.focusSelection("canvas");
  };
  return (
    <>
      <Row
        icon={LayoutGridIcon}
        label={props.spec.title}
        count={String(items.length)}
        active={false}
        onPick={() => {
          const [first] = items;
          if (first !== undefined) select(first);
        }}
      />
      {items.map((item, index) => {
        const instance = page.blocks[item];
        const contract = instance === undefined ? undefined : definitions.get(instance.type);
        if (instance === undefined || contract === undefined) return null;
        const titled = contract.fields[itemNaming(contract).titleField];
        const title =
          titled === undefined
            ? ""
            : summaryOf(titled, instance.props[itemNaming(contract).titleField], draft).text;
        const open = state.selection?.block === item || state.pointed?.block === item;
        return (
          <li key={item} className="flex flex-col">
            <ul className="flex flex-col">
              <Row
                icon={null}
                label={title === "" ? itemLabel(itemNaming(contract), index) : title}
                active={open}
                onPick={() => select(item)}
              />
            </ul>
            {open && (
              <ul className="ml-9 flex flex-col border-l pl-2">
                <FieldRows
                  target={props.page}
                  block={item}
                  contract={contract}
                  fields={Object.entries(contract.fields)}
                  props={instance.props}
                  within={[]}
                />
              </ul>
            )}
          </li>
        );
      })}
      <li className="pl-11">
        <Button
          variant="link"
          size="sm"
          className="h-7 px-0"
          onClick={() => {
            const op = insertOp(
              definitions,
              props.page,
              { block: props.section, slot: props.slot },
              items.at(-1) ?? null,
              type,
            );
            if (store.run([op]).length === 0) select(op.block.id);
          }}
        >
          <PlusIcon />
          {addItemLabel(naming)}
        </Button>
      </li>
    </>
  );
}

/** The row for what the block shows from the site. */
function SiteContentRow() {
  const { siteContent, explain } = useShowcase();
  const [first] = siteContent?.elements ?? [];
  if (siteContent === null || first === undefined) return null;
  return (
    <Row
      icon={LockIcon}
      label={siteContent.label}
      summary={plain("From your site")}
      active={false}
      onPick={() => explain(first)}
    />
  );
}

/**
 * Everything in the block the customizer shows. For an item block, that's
 * the items in the section that holds them.
 */
export function PartsPanel(props: {
  readonly target: Target;
  readonly block: BlockId;
  /** The item type the customizer is about, or null when it's about the block itself. */
  readonly item: BlockType | null;
}) {
  const id = useId();
  const { definitions } = useServices();
  const { siteContent } = useShowcase();
  const instance = useEditorState(
    (state) => holderOf(state.view, props.target)?.blocks[props.block],
  );
  const contract = instance === undefined ? undefined : definitions.get(instance.type);
  if (instance === undefined || contract === undefined) return null;
  const slots =
    contract.placement === "section" && props.target !== "site"
      ? Object.entries(contract.slots).filter(
          ([, spec]) => props.item === null || spec.accepts.includes(props.item),
        )
      : [];
  const page = props.target;
  return (
    <aside aria-labelledby={id} className="flex flex-col gap-2 rounded-xl border bg-card p-3 pt-4">
      <h2 id={id} className="px-2 text-sm font-medium text-secondary-foreground">
        Everything in this block
      </h2>
      <ul className="flex flex-col">
        {siteContent?.first === true && <SiteContentRow />}
        {props.item === null && (
          <FieldRows
            target={props.target}
            block={props.block}
            contract={contract}
            fields={Object.entries(contract.fields)}
            props={instance.props}
            within={[]}
          />
        )}
        {page !== "site" &&
          slots.map(([slot, spec]) => (
            <SlotRows key={slot} page={page} section={props.block} slot={slot} spec={spec} />
          ))}
        {siteContent?.first === false && <SiteContentRow />}
      </ul>
    </aside>
  );
}
