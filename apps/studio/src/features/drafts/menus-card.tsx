import { type DraftId, MenuItemId, randomId, type SiteId } from "@repo/contracts/ids";
import type { Op } from "@repo/contracts/ops";
import { pageName } from "@repo/contracts/page";
import { ExternalUrl, type Link } from "@repo/contracts/references";
import { MenuItem, type Menus } from "@repo/contracts/site";
import type { DraftPageSummary } from "@repo/contracts/studio";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Field, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import { useMutation } from "@tanstack/react-query";
import { Option, Predicate, Schema } from "effect";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  IndentDecreaseIcon,
  IndentIncreaseIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useId, useState } from "react";

import { sendBatch } from "../sites/send-batch";

/** The ops that send a batch's errors to the person, or nothing when it went through. */
const sent = async (site: SiteId, draft: DraftId, ops: ReadonlyArray<Op>) => {
  const outcome = await sendBatch(site, draft, ops);
  return outcome.status === "rejected" ? outcome.errors : [];
};

/** A menu item as the editor lists it: flat, with how deep it sits. */
interface Row {
  readonly id: MenuItemId;
  readonly label: string;
  readonly target: Link;
  readonly depth: 0 | 1;
}

const rowsOf = (items: ReadonlyArray<MenuItem>): ReadonlyArray<Row> =>
  items.flatMap((item) => [
    { id: item.id, label: item.label, target: item.target, depth: 0 as const },
    ...(item.children ?? []).map((child) => ({ ...child, depth: 1 as const })),
  ]);

/** Rows back into items: a sub-item belongs to the item above it, and a first one becomes an item. */
const itemsOf = (rows: ReadonlyArray<Row>): ReadonlyArray<MenuItem> => {
  const items: Array<MenuItem> = [];
  for (const { depth, ...link } of rows) {
    const parent = items.at(-1);
    if (depth === 1 && parent !== undefined)
      items[items.length - 1] = { ...parent, children: [...(parent.children ?? []), link] };
    else items.push(link);
  }
  return items;
};

const decodeUrl = Schema.decodeOption(ExternalUrl);
const isMenu = Schema.is(Schema.Array(MenuItem));

const anotherAddress = "url";

function MenuRow(props: {
  readonly row: Row;
  readonly number: number;
  readonly count: number;
  readonly nests: boolean;
  readonly pages: ReadonlyArray<DraftPageSummary>;
  readonly onChange: (row: Row) => void;
  readonly onMove: (by: -1 | 1) => void;
  readonly onRemove: () => void;
}) {
  const { row } = props;
  const ids = { label: useId(), target: useId(), url: useId() };
  const [label, setLabel] = useState(row.label);
  const [url, setUrl] = useState(Predicate.isString(row.target) ? row.target : "");
  const [external, setExternal] = useState(Predicate.isString(row.target));
  const [badUrl, setBadUrl] = useState(false);
  const saveUrl = () => {
    const decoded = decodeUrl(url);
    setBadUrl(Option.isNone(decoded));
    if (Option.isSome(decoded) && decoded.value !== row.target)
      props.onChange({ ...row, target: decoded.value });
  };
  const name = row.label || `Item ${props.number}`;
  return (
    <li className={`flex flex-col gap-2 rounded-md border p-3 ${row.depth === 1 ? "ml-8" : ""}`}>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={ids.label}>Label</FieldLabel>
          <Input
            id={ids.label}
            value={label}
            maxLength={40}
            onChange={(event) => setLabel(event.target.value)}
            onBlur={() => label !== row.label && props.onChange({ ...row, label })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={ids.target}>Links to</FieldLabel>
          <NativeSelect
            id={ids.target}
            className="w-full"
            value={external ? anotherAddress : Predicate.isString(row.target) ? "" : row.target.id}
            onChange={(event) => {
              if (event.target.value === anotherAddress) return setExternal(true);
              const page = props.pages.find((candidate) => candidate.id === event.target.value);
              setExternal(false);
              if (page !== undefined)
                props.onChange({ ...row, target: { $ref: "page", id: page.id } });
            }}
          >
            {props.pages
              // A post isn't offered, but an item that already links to one keeps showing it.
              .filter(
                (page) =>
                  page.type !== "entry" ||
                  (!Predicate.isString(row.target) && row.target.id === page.id),
              )
              .map((page) => (
                <NativeSelectOption key={page.id} value={page.id}>
                  {pageName(page)}
                </NativeSelectOption>
              ))}
            <NativeSelectOption value={anotherAddress}>Another address</NativeSelectOption>
          </NativeSelect>
        </Field>
      </div>
      {external && (
        <Field data-invalid={badUrl || undefined}>
          <FieldLabel htmlFor={ids.url}>Address</FieldLabel>
          <Input
            id={ids.url}
            type="url"
            value={url}
            placeholder="https://"
            aria-invalid={badUrl || undefined}
            onChange={(event) => setUrl(event.target.value)}
            onBlur={saveUrl}
          />
          {badUrl && <FieldError>Enter a full address, such as https://example.org.</FieldError>}
        </Field>
      )}
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Move ${name} up`}
          disabled={props.number === 1}
          onClick={() => props.onMove(-1)}
        >
          <ArrowUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Move ${name} down`}
          disabled={props.number === props.count}
          onClick={() => props.onMove(1)}
        >
          <ArrowDownIcon />
        </Button>
        {props.nests && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={row.depth === 0 ? `Make ${name} a sub-item` : `Make ${name} a top item`}
            disabled={row.depth === 0 && props.number === 1}
            onClick={() => props.onChange({ ...row, depth: row.depth === 0 ? 1 : 0 })}
          >
            {row.depth === 0 ? <IndentIncreaseIcon /> : <IndentDecreaseIcon />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${name}`}
          onClick={props.onRemove}
        >
          <Trash2Icon />
        </Button>
      </div>
    </li>
  );
}

/** One of the site's menus, saved to the draft with each change. */
function MenuEditor(props: {
  readonly site: SiteId;
  readonly draft: DraftId;
  readonly menu: "main" | "footer";
  readonly items: ReadonlyArray<MenuItem>;
  readonly pages: ReadonlyArray<DraftPageSummary>;
  readonly onSaved: () => Promise<void>;
}) {
  const [errors, setErrors] = useState<ReadonlyArray<{ readonly message: string }>>([]);
  // Each change saves the whole menu, so the menu as last changed here is what the next change builds on.
  const [rows, setRows] = useState(() => rowsOf(props.items));
  const [shown, setShown] = useState(props.items);
  const saving = useMutation({
    // One save at a time, in the order they were made.
    scope: { id: `menu-${props.menu}` },
    mutationFn: async (next: ReadonlyArray<Row>) => {
      const items = itemsOf(next);
      if (!isMenu(items)) return [{ message: "Each label can be at most 40 characters." }];
      const op: Op =
        props.menu === "main"
          ? { op: "setMenu", menu: "main", items }
          : {
              op: "setMenu",
              menu: "footer",
              items: items.map((item) => ({ id: item.id, label: item.label, target: item.target })),
            };
      return sent(props.site, props.draft, [op]);
    },
    onSuccess: async (found) => {
      setErrors(found.map((error) => ({ message: error.message })));
      await props.onSaved();
    },
  });
  if (props.items !== shown && !saving.isPending) {
    setShown(props.items);
    setRows(rowsOf(props.items));
  }
  const save = (next: ReadonlyArray<Row>) => {
    setRows(next);
    saving.mutate(next);
  };
  const first = props.pages.find((page) => page.type !== "entry");
  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No items yet.</p>}
      <ol className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <MenuRow
            key={`${row.id}-${JSON.stringify(row)}`}
            row={row}
            number={index + 1}
            count={rows.length}
            nests={props.menu === "main"}
            pages={props.pages}
            onChange={(changed) =>
              save(rows.map((current, at) => (at === index ? changed : current)))
            }
            onMove={(by) => {
              const moved = [...rows];
              const [taken] = moved.splice(index, 1);
              if (taken !== undefined) moved.splice(index + by, 0, taken);
              save(moved);
            }}
            onRemove={() => save(rows.filter((_, at) => at !== index))}
          />
        ))}
      </ol>
      {first !== undefined && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            save([
              ...rows,
              {
                id: MenuItemId.make(randomId("mi")),
                label: first.meta.title || "New item",
                target: { $ref: "page", id: first.id },
                depth: 0,
              },
            ])
          }
        >
          <PlusIcon />
          Add item
        </Button>
      )}
      <FieldError errors={[...errors]} />
    </div>
  );
}

/** The site's main and footer menus, as this draft has them. */
export function MenusCard(props: {
  readonly site: SiteId;
  readonly draft: DraftId;
  readonly menus: Menus;
  readonly pages: ReadonlyArray<DraftPageSummary>;
  readonly onSaved: () => Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Menus</h2>
        </CardTitle>
        <CardDescription>
          Menu items link to a page on this site or to another address. When a page's address
          changes, its menu items follow it.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-8 lg:grid-cols-2">
        <section aria-label="Main menu" className="flex flex-col gap-3">
          <div>
            <h3 className="font-medium">Main menu</h3>
            <p className="text-sm text-muted-foreground">
              Shown in the header. Items can have one level of sub-items.
            </p>
          </div>
          <MenuEditor {...props} menu="main" items={props.menus.main} />
        </section>
        <section aria-label="Footer menu" className="flex flex-col gap-3">
          <div>
            <h3 className="font-medium">Footer menu</h3>
            <p className="text-sm text-muted-foreground">Shown in the footer.</p>
          </div>
          <MenuEditor {...props} menu="footer" items={props.menus.footer} />
        </section>
      </CardContent>
    </Card>
  );
}
