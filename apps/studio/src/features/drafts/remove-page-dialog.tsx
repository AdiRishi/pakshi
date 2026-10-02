import { collectionKinds } from "@repo/contracts/collections";
import type { PageId } from "@repo/contracts/ids";
import type { BatchError, Op } from "@repo/contracts/ops";
import { type CollectionKind, pageName } from "@repo/contracts/page";
import type { Link } from "@repo/contracts/references";
import type { Menus } from "@repo/contracts/site";
import type { DraftPageSummary } from "@repo/contracts/studio";
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
import { Field, FieldError, FieldLabel } from "@repo/ui/components/field";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import { Predicate } from "effect";
import { useId, useState } from "react";

import { entriesIn, removalBatches } from "./remove-collection";

const linksTo = (target: Link, pages: ReadonlySet<PageId>) =>
  !Predicate.isString(target) && pages.has(target.id);

/** How many menu items link to any of these pages, sub-items included. */
const menuLinksTo = (menus: Menus, pages: ReadonlySet<PageId>) =>
  [...menus.main.flatMap((item) => [item, ...(item.children ?? [])]), ...menus.footer].filter(
    (item) => linksTo(item.target, pages),
  ).length;

/** "1 post" or "12 posts", in a kind's words. */
export const countOf = (count: number, kind: CollectionKind) => {
  const { one, many } = collectionKinds[kind].names;
  return `${count} ${count === 1 ? one : many}`;
};

/**
 * Unpublishes or deletes a page: it leaves the live site and its menus when
 * the draft publishes, and its address can send visitors to another page. A
 * blog takes its posts with it.
 */
export function RemovePageDialog(props: {
  readonly draftName: string;
  readonly page: DraftPageSummary;
  readonly pages: ReadonlyArray<DraftPageSummary>;
  readonly menus: Menus;
  readonly action: "unpublish" | "delete";
  /** Sends one batch, and resolves with its errors, or none when it committed. */
  readonly send: (ops: ReadonlyArray<Op>) => Promise<ReadonlyArray<BatchError>>;
  readonly onClose: () => void;
}) {
  const id = useId();
  const { page, action } = props;
  const title = pageName(page);
  const entries = entriesIn(page, props.pages);
  const going = new Set([page.id, ...entries.map((entry) => entry.id)]);
  const [redirect, setRedirect] = useState("");
  const [errors, setErrors] = useState<ReadonlyArray<BatchError>>([]);
  const [working, setWorking] = useState(false);
  const targets = props.pages.filter(
    (candidate) => !going.has(candidate.id) && candidate.standing !== "unpublished",
  );
  const linked = menuLinksTo(props.menus, going);
  const remove = async () => {
    const to = targets.find((candidate) => candidate.id === redirect);
    setWorking(true);
    for (const ops of removalBatches({
      page,
      pages: props.pages,
      menus: props.menus,
      action,
      redirectTo: to?.id ?? null,
    })) {
      const found = await props.send(ops);
      if (found.length > 0) {
        setWorking(false);
        return setErrors(found);
      }
    }
    props.onClose();
  };
  const verb = action === "unpublish" ? "Unpublish" : "Delete";
  const held =
    page.type === "collection" && entries.length > 0
      ? { kind: page.kind, count: entries.length }
      : null;
  return (
    <AlertDialog open onOpenChange={(open) => !open && props.onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {verb} "{title}"{held !== null && ` and its ${countOf(held.count, held.kind)}`}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {held === null
              ? `When ${props.draftName} publishes, ${title} leaves the live site, the sitemap and the menus. Anyone who visits ${page.path} sees that the page has gone, unless you send them to another page.`
              : `When ${props.draftName} publishes, ${title} and its ${countOf(held.count, held.kind)} leave the live site, the sitemap and the menus, and their addresses say they have gone. You can send visitors to ${page.path} to another page instead.`}
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
          <li>{consequence(action, held)}</li>
        </ul>
        <FieldError errors={errors.map((error) => ({ message: error.message }))} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={action === "delete" ? "destructive" : "default"}
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

/** What happens to the page in the draft itself, and to a blog's posts. */
const consequence = (
  action: "unpublish" | "delete",
  held: { readonly kind: CollectionKind; readonly count: number } | null,
) => {
  if (held === null)
    return action === "unpublish"
      ? "The page stays in this draft, so you can publish it again later. To remove it from the draft as well, delete it instead."
      : "The page is removed from this draft too. Undo can bring it back while you're editing.";
  const { kind, one, many } = collectionKinds[held.kind].names;
  const blog = kind.toLowerCase();
  const posts = held.count === 1 ? one : many;
  if (action === "delete")
    return `The ${blog} and its ${posts} are removed from this draft too. Undo can bring them back while you're editing.`;
  return held.count === 1
    ? `The ${blog} and its ${posts} stay in this draft. Publishing the ${blog} again brings its ${posts} back too, unless you unpublished it separately.`
    : `The ${blog} and its ${posts} stay in this draft. Publishing the ${blog} again brings its ${posts} back too, apart from any you unpublished separately.`;
};
