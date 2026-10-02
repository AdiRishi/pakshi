import { type DraftId, MenuItemId, type PageId, randomId, type SiteId } from "@repo/contracts/ids";
import type { BatchError, Op } from "@repo/contracts/ops";
import { ExternalUrl, type Link } from "@repo/contracts/references";
import { pageName } from "@repo/contracts/page";
import { MenuItem, type Menus } from "@repo/contracts/site";
import type { DraftPageSummary, PageStanding } from "@repo/contracts/studio";
import { menusWithout } from "@repo/domain/document";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
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

const standings = {
  new: { label: "New", variant: "default" },
  changed: { label: "Changed", variant: "secondary" },
  live: { label: "Live", variant: "outline" },
  unpublished: { label: "Unpublished", variant: "warning" },
} as const satisfies Record<
  PageStanding,
  { readonly label: string; readonly variant: "default" | "secondary" | "outline" | "warning" }
>;

/** How a page in the draft stands against the live site. */
export function StandingBadge(props: { readonly standing: PageStanding }) {
  const { label, variant } = standings[props.standing];
  return <Badge variant={variant}>{label}</Badge>;
}

const linksTo = (target: Link, page: PageId) => !Predicate.isString(target) && target.id === page;

/** How many menu items link to a page, sub-items included. */
const menuLinksTo = (menus: Menus, page: PageId) =>
  [...menus.main.flatMap((item) => [item, ...(item.children ?? [])]), ...menus.footer].filter(
    (item) => linksTo(item.target, page),
  ).length;

/** The ops that send a batch's errors to the person, or nothing when it went through. */
const sent = async (site: SiteId, draft: DraftId, ops: ReadonlyArray<Op>) => {
  const outcome = await sendBatch(site, draft, ops);
  return outcome.status === "rejected" ? outcome.errors : [];
};

/**
 * Unpublishes or deletes a page: it leaves the live site and its menus when
 * the draft publishes, and its address can send visitors to another page.
 */
export function RemovePageDialog(props: {
  readonly site: SiteId;
  readonly draft: { readonly id: DraftId; readonly name: string };
  readonly page: DraftPageSummary;
  readonly pages: ReadonlyArray<DraftPageSummary>;
  readonly menus: Menus;
  readonly action: "unpublish" | "delete";
  readonly onClose: () => void;
  readonly onDone: () => Promise<void>;
}) {
  const id = useId();
  const { page } = props;
  const title = pageName(page);
  const [redirect, setRedirect] = useState("");
  const [errors, setErrors] = useState<ReadonlyArray<BatchError>>([]);
  const [working, setWorking] = useState(false);
  const targets = props.pages.filter(
    (candidate) => candidate.id !== page.id && candidate.standing !== "unpublished",
  );
  const linked = menuLinksTo(props.menus, page.id);
  const remove = async () => {
    const to = targets.find((candidate) => candidate.id === redirect);
    const ops: Array<Op> = [...menusWithout(props.menus, page.id)];
    if (to !== undefined)
      ops.push({ op: "setRedirect", from: page.path, to: { $ref: "page", id: to.id } });
    ops.push(
      props.action === "unpublish"
        ? { op: "setStatus", page: page.id, status: "unpublished" }
        : { op: "deletePage", page: page.id },
    );
    setWorking(true);
    const found = await sent(props.site, props.draft.id, ops);
    setWorking(false);
    setErrors(found);
    if (found.length === 0) await props.onDone();
  };
  const verb = props.action === "unpublish" ? "Unpublish" : "Delete";
  return (
    <AlertDialog open onOpenChange={(open) => !open && props.onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {verb} "{title}"?
          </AlertDialogTitle>
          <AlertDialogDescription>
            When {props.draft.name} publishes, {title} leaves the live site, the sitemap and the
            menus. Anyone who visits {page.path} sees that the page has gone, unless you send them
            to another page.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor={id}>Redirect {page.path} to</FieldLabel>
          <NativeSelect
            id={id}
            className="w-full"
            value={redirect}
            onChange={(event) => setRedirect(event.target.value)}
          >
            <NativeSelectOption value="">No page: say it has gone</NativeSelectOption>
            {targets.map((target) => (
              <NativeSelectOption key={target.id} value={target.id}>
                {pageName(target)} ({target.path})
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          {linked > 0 && (
            <li>
              {linked === 1 ? "Its menu item is" : `Its ${linked} menu items are`} removed in this
              draft.
            </li>
          )}
          <li>
            {props.action === "unpublish"
              ? "The page stays in this draft, so you can publish it again later. To remove it from the draft as well, delete it instead."
              : "The page is removed from this draft too. Undo can bring it back while you're editing."}
          </li>
        </ul>
        <FieldError errors={errors.map((error) => ({ message: error.message }))} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={props.action === "delete" ? "destructive" : "default"}
            disabled={working}
            onClick={() => void remove()}
          >
            {verb}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

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
            {props.pages.map((page) => (
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
  const [first] = props.pages;
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
