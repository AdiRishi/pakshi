import { collectionKinds } from "@repo/contracts/collections";
import type { DraftId, PageId, SiteId } from "@repo/contracts/ids";
import type { BatchError, Op } from "@repo/contracts/ops";
import { type PageDocument, pageName } from "@repo/contracts/page";
import type { Menus } from "@repo/contracts/site";
import { entryAddress, type Lockfile } from "@repo/contracts/snapshot";
import type { DraftPageSummary, PageStanding } from "@repo/contracts/studio";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Card } from "@repo/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import {
  ChevronRightIcon,
  FileTextIcon,
  MoreHorizontalIcon,
  NewspaperIcon,
  PlusIcon,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import { blocksQuery } from "@/features/blocks/blocks-query";
import { formatDay, today } from "@/lib/dates";

import { newBlog, newPage, newPost } from "./new-pages";
import { PageDialog, type PageValues } from "./page-dialog";
import { entriesIn } from "./remove-collection";
import { countOf, RemovePageDialog } from "./remove-page-dialog";

type Entry = Extract<DraftPageSummary, { readonly type: "entry" }>;
type Collection = Extract<DraftPageSummary, { readonly type: "collection" }>;

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
function StandingBadge(props: { readonly standing: PageStanding }) {
  const { label, variant } = standings[props.standing];
  return <Badge variant={variant}>{label}</Badge>;
}

/** A blog with more posts than this starts folded, so its posts don't bury the pages below it. */
const unfoldedPosts = 10;

const rowId = (page: PageId) => `pages-row-${page}`;

/** A page or a collection, with a collection's entries in its kind's order. */
interface Branch {
  readonly page: DraftPageSummary;
  readonly entries: ReadonlyArray<Entry>;
}

const branchesOf = (pages: ReadonlyArray<DraftPageSummary>): ReadonlyArray<Branch> =>
  pages
    .filter((page) => page.type !== "entry")
    .toSorted((a, b) => (a.path < b.path ? -1 : 1))
    .map((page) => ({
      page,
      entries: entriesIn(page, pages),
    }));

/** What a page is called in a sentence: "page", "blog" or "post". */
const nounOf = (page: DraftPageSummary) => {
  if (page.type === "page") return "page";
  const { names } = collectionKinds[page.kind];
  return page.type === "collection" ? names.kind.toLowerCase() : names.one;
};

/** What becomes of an address later, said under its field. */
const pageHint = "Menu links follow the page when its address changes.";
const blogHint = "Its posts' addresses start with this one, and change with it.";
const postHint = (blog: string) => `If ${blog} gets a new address, this one changes with it.`;

const collectionOf = (entry: Entry, pages: ReadonlyArray<DraftPageSummary>) => {
  const collection = pages.find((page) => page.id === entry.collection);
  if (collection?.type !== "collection")
    throw new Error(`${entry.collection} isn't a collection among the draft's pages.`);
  return collection;
};

type Open =
  | { readonly dialog: "new-page" }
  | { readonly dialog: "new-blog" }
  | { readonly dialog: "new-post"; readonly blog: Collection }
  | { readonly dialog: "rename"; readonly page: DraftPageSummary }
  | {
      readonly dialog: "remove";
      readonly page: DraftPageSummary;
      readonly action: "unpublish" | "delete";
    };

interface RowActions {
  readonly site: SiteId;
  readonly draft: DraftId;
  readonly onOpen: (open: Open) => void;
  readonly onRepublish: (page: DraftPageSummary) => void;
}

function Actions(
  props: RowActions & {
    readonly page: DraftPageSummary;
    /** Whether its blog is unpublished, so the post can't be published or unpublished alone. */
    readonly heldBack: boolean;
    readonly children?: ReactNode;
  },
) {
  const { page } = props;
  const name = pageName(page);
  return (
    <div className="flex items-center justify-end gap-1">
      {props.children}
      <Link
        to="/sites/$siteId/drafts/$draftId/pages/$pageId"
        params={{ siteId: props.site, draftId: props.draft, pageId: page.id }}
        className={buttonVariants({ variant: "outline", size: "sm" })}
        aria-label={`Edit ${name}`}
      >
        Edit
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`More for ${name}`} />}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => props.onOpen({ dialog: "rename", page })}>
            Rename
          </DropdownMenuItem>
          {!props.heldBack &&
            (page.standing === "unpublished" ? (
              <DropdownMenuItem onClick={() => props.onRepublish(page)}>
                Publish again
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => props.onOpen({ dialog: "remove", page, action: "unpublish" })}
              >
                Unpublish
              </DropdownMenuItem>
            ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => props.onOpen({ dialog: "remove", page, action: "delete" })}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Title(props: { readonly page: DraftPageSummary; readonly className?: string }) {
  return props.page.meta.title === "" ? (
    <span className={cn("text-muted-foreground", props.className)}>
      Untitled{props.page.type === "entry" && ` (${pageName(props.page)})`}
    </span>
  ) : (
    <span className={cn("truncate", props.className)}>{props.page.meta.title}</span>
  );
}

/** A page, or a blog with its posts under it when it's unfolded. */
function BranchRows(
  props: RowActions & {
    readonly branch: Branch;
    readonly unfolded: boolean;
    readonly onFold: (unfolded: boolean) => void;
  },
) {
  const { branch, unfolded, onFold, ...actions } = props;
  const { page, entries } = branch;
  if (page.type !== "collection")
    return (
      <TableRow>
        <TableCell className="pl-12">
          <Title page={page} className="font-medium" />
        </TableCell>
        <TableCell className="font-mono text-muted-foreground">{page.path}</TableCell>
        <TableCell>
          <StandingBadge standing={page.standing} />
        </TableCell>
        <TableCell className="pr-4">
          <Actions {...actions} page={page} heldBack={false} />
        </TableCell>
      </TableRow>
    );
  const name = pageName(page);
  const { names } = collectionKinds[page.kind];
  const emptyId = rowId(page.id);
  const newPost = () => props.onOpen({ dialog: "new-post", blog: page });
  return (
    <>
      <TableRow className="has-aria-expanded:bg-transparent hover:has-aria-expanded:bg-muted/50 has-data-popup-open:bg-muted/50">
        <TableCell className="pl-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7 aria-expanded:bg-transparent"
              aria-expanded={unfolded}
              aria-controls={
                unfolded
                  ? entries.length === 0
                    ? emptyId
                    : entries.map((entry) => rowId(entry.id)).join(" ")
                  : undefined
              }
              aria-label={`${unfolded ? "Hide" : "Show"} ${names.many} in ${name}`}
              onClick={() => onFold(!unfolded)}
            >
              <ChevronRightIcon
                className={cn(
                  "text-muted-foreground transition-transform motion-reduce:transition-none",
                  unfolded && "rotate-90",
                )}
              />
            </Button>
            <Title page={page} className="font-medium" />
            <span className="shrink-0 text-muted-foreground">
              {names.kind} · {countOf(entries.length, page.kind)}
            </span>
          </div>
        </TableCell>
        <TableCell className="font-mono text-muted-foreground">{page.path}</TableCell>
        <TableCell>
          <StandingBadge standing={page.standing} />
        </TableCell>
        <TableCell className="pr-4">
          <Actions {...actions} page={page} heldBack={false}>
            <Button
              variant="ghost"
              size="sm"
              onClick={newPost}
              aria-label={`New ${names.one} in ${name}`}
            >
              <PlusIcon />
              New {names.one}
            </Button>
          </Actions>
        </TableCell>
      </TableRow>
      {unfolded &&
        (entries.length === 0 ? (
          <TableRow id={emptyId} className="hover:bg-transparent">
            <TableCell colSpan={4} className="relative py-3 pl-16">
              <Guide />
              <p className="flex flex-wrap items-center gap-x-1 text-muted-foreground">
                No {names.many} yet.
                <Button variant="link" className="h-auto p-0" onClick={newPost}>
                  Write the first {names.one}
                </Button>
              </p>
            </TableCell>
          </TableRow>
        ) : (
          entries.map((entry, index) => (
            <TableRow
              key={entry.id}
              id={rowId(entry.id)}
              className={cn(index < entries.length - 1 && "border-b-0")}
            >
              <TableCell className="relative pl-16">
                <Guide />
                <div className="flex min-w-0 items-center gap-3">
                  <Title page={entry} />
                  <span className="shrink-0 text-muted-foreground">
                    {formatDay(entry.meta.date)}
                  </span>
                </div>
              </TableCell>
              <TableCell className="font-mono text-muted-foreground">{entry.path}</TableCell>
              <TableCell>
                <StandingBadge standing={entry.standing} />
              </TableCell>
              <TableCell className="pr-4">
                <Actions {...actions} page={entry} heldBack={page.standing === "unpublished"} />
              </TableCell>
            </TableRow>
          ))
        ))}
    </>
  );
}

/** The line that ties a blog's posts to it, down from its fold button's middle. */
function Guide() {
  return <span aria-hidden className="absolute inset-y-0 left-6.5 w-px bg-border" />;
}

/**
 * The draft's pages in order of address, each blog with its posts under it,
 * and the dialogs that make, rename and remove them. `send` sends one batch
 * and resolves with its errors, or none once it committed and the pages
 * shown have caught up.
 */
export function PagesTree(props: {
  readonly site: SiteId;
  readonly draft: { readonly id: DraftId; readonly name: string };
  readonly pages: ReadonlyArray<DraftPageSummary>;
  readonly menus: Menus;
  readonly lockfile: Lockfile;
  /** Who a new post is by: the person making it. */
  readonly author: string;
  readonly send: (ops: ReadonlyArray<Op>) => Promise<ReadonlyArray<BatchError>>;
  /** Opens a page just made, to build it in the editor. */
  readonly onCreated: (page: PageId) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const headingId = useId();
  const [open, setOpen] = useState<Open | null>(null);
  const [folds, setFolds] = useState<Readonly<Record<PageId, boolean>>>({});
  const branches = branchesOf(props.pages);
  const close = (isOpen: boolean) => {
    if (!isOpen) setOpen(null);
  };

  const create = async (make: () => Promise<PageDocument>) => {
    const page = await make();
    const errors = await props.send([{ op: "createPage", page }]);
    if (errors.length === 0) await props.onCreated(page.id);
    return errors;
  };
  const contracts = () => queryClient.query(blocksQuery(props.lockfile));

  const rename = (page: DraftPageSummary, values: PageValues) =>
    props.send([
      { op: "setMeta", page: page.id, field: "title", value: values.title },
      page.type === "entry"
        ? { op: "setSlug", page: page.id, slug: values.address }
        : { op: "setPath", page: page.id, path: values.address },
    ]);

  const rowActions: RowActions = {
    site: props.site,
    draft: props.draft.id,
    onOpen: setOpen,
    onRepublish: (page) =>
      void props.send([{ op: "setStatus", page: page.id, status: "published" }]),
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="text-lg font-semibold">
            Pages
          </h2>
          <p className="text-sm text-muted-foreground">
            In order of address, with each blog's posts under it, newest first.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setOpen({ dialog: "new-blog" })}>
            <NewspaperIcon />
            New blog
          </Button>
          <Button onClick={() => setOpen({ dialog: "new-page" })}>
            <PlusIcon />
            New page
          </Button>
        </div>
      </div>
      <Card className="gap-0 py-0">
        {branches.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileTextIcon />
              </EmptyMedia>
              <EmptyTitle>No pages yet</EmptyTitle>
              <EmptyDescription>
                Start with a page, or a blog for news and stories. Nothing goes live until the draft
                is published.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-12">Title</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>In this draft</TableHead>
                <TableHead className="w-0 pr-4">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((branch) => (
                <BranchRows
                  key={branch.page.id}
                  {...rowActions}
                  branch={branch}
                  unfolded={folds[branch.page.id] ?? branch.entries.length <= unfoldedPosts}
                  onFold={(unfolded) =>
                    setFolds((current) => ({ ...current, [branch.page.id]: unfolded }))
                  }
                />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      {open?.dialog === "new-page" && (
        <PageDialog
          open
          onOpenChange={close}
          heading="New page"
          description="The page starts empty in this draft. Nothing goes live until it's published."
          submitLabel="Create page"
          initial={{ title: "", address: "/" }}
          address={{ under: null, followsTitle: true }}
          addressHint={pageHint}
          onSubmit={(values) =>
            create(async () => newPage({ title: values.title, path: values.address }))
          }
        />
      )}
      {open?.dialog === "new-blog" && (
        <PageDialog
          open
          onOpenChange={close}
          heading="New blog"
          description="A blog is a page that lists its posts, newest first. Name it for what it holds, such as News or Stories."
          submitLabel="Create blog"
          initial={{ title: "", address: "/" }}
          address={{ under: null, followsTitle: true }}
          addressHint={blogHint}
          onSubmit={(values) =>
            create(async () =>
              newBlog({
                contracts: await contracts(),
                listings: props.pages,
                title: values.title,
                path: values.address,
              }),
            )
          }
        />
      )}
      {open?.dialog === "new-post" && (
        <PageDialog
          open
          onOpenChange={close}
          heading={`New post in ${pageName(open.blog)}`}
          description="The post is dated today, with you as its author. You can change both in its settings."
          submitLabel="Create post"
          initial={{ title: "", address: "" }}
          address={{ under: open.blog.path, followsTitle: true }}
          addressHint={postHint(pageName(open.blog))}
          onSubmit={(values) =>
            create(async () =>
              newPost({
                contracts: await contracts(),
                listings: props.pages,
                blog: open.blog.id,
                title: values.title,
                slug: values.address,
                author: props.author,
                today: today(),
              }),
            )
          }
        />
      )}
      {open?.dialog === "rename" && (
        <PageDialog
          open
          onOpenChange={close}
          heading={`Rename ${nounOf(open.page)}`}
          description="The new title and address apply in this draft. The live site changes when it's published."
          submitLabel="Rename"
          initial={{
            title: open.page.meta.title,
            address:
              open.page.type === "entry"
                ? open.page.path.slice(
                    entryAddress(collectionOf(open.page, props.pages).path, "").length,
                  )
                : open.page.path,
          }}
          address={{
            under: open.page.type === "entry" ? collectionOf(open.page, props.pages).path : null,
            followsTitle: false,
          }}
          addressHint={
            open.page.type === "page"
              ? pageHint
              : open.page.type === "collection"
                ? blogHint
                : postHint(pageName(collectionOf(open.page, props.pages)))
          }
          onSubmit={(values) => rename(open.page, values)}
        />
      )}
      {open?.dialog === "remove" && (
        <RemovePageDialog
          draftName={props.draft.name}
          page={open.page}
          pages={props.pages}
          menus={props.menus}
          action={open.action}
          send={props.send}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
