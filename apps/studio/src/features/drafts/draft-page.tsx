import { isBehind } from "@repo/contracts/draft";
import { type DraftId, PageId, randomId, type SiteId } from "@repo/contracts/ids";
import type { PageDocument } from "@repo/contracts/page";
import type { DraftPageSummary, PageSummary, Viewer } from "@repo/contracts/studio";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/components/breadcrumb";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  FileTextIcon,
  GitMergeIcon,
  MoreHorizontalIcon,
  NewspaperIcon,
  PlusIcon,
} from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { standing } from "@/features/approvals/describe";

import { draftPagesQuery } from "../sites/queries";
import { sendBatch } from "../sites/send-batch";
import { DraftActions } from "./draft-actions";
import { PageDialog, type SubmittedPage } from "./page-dialog";
import { MenusCard, RemovePageDialog, StandingBadge } from "./pages-and-menus";

type PageType = PageSummary["type"];

const copy = {
  page: {
    tab: "Pages",
    create: "New page",
    description: "The page starts empty in this draft. Nothing goes live until it's published.",
    prefix: "/",
  },
  post: {
    tab: "Blog posts",
    create: "New post",
    description: "The post starts empty in this draft. Nothing goes live until it's published.",
    prefix: "/blog/",
  },
} as const;

const newPage = (type: PageType, values: SubmittedPage, author: string): PageDocument => {
  const common = {
    schema: "pakshi.page/1",
    id: PageId.make(randomId("pg")),
    path: values.path,
    root: [],
    blocks: {},
  } as const;
  return type === "page"
    ? { ...common, type, meta: { title: values.title, description: "" } }
    : {
        ...common,
        type,
        meta: {
          title: values.title,
          description: "",
          date: new Date().toISOString().slice(0, 10),
          author,
          tags: [],
          excerpt: "",
        },
      };
};

function PagesTable(props: {
  readonly site: SiteId;
  readonly draft: DraftId;
  readonly pages: ReadonlyArray<DraftPageSummary>;
  readonly onRename: (page: PageSummary) => void;
  readonly onRemove: (page: DraftPageSummary, action: "unpublish" | "delete") => void;
  readonly onRepublish: (page: DraftPageSummary) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="px-6">Title</TableHead>
          <TableHead>Address</TableHead>
          <TableHead>In this draft</TableHead>
          <TableHead className="w-0 px-6">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.pages.map((page) => (
          <TableRow key={page.id}>
            <TableCell className="px-6 font-medium">
              {page.title === "" ? (
                <span className="text-muted-foreground">Untitled</span>
              ) : (
                page.title
              )}
            </TableCell>
            <TableCell className="font-mono text-muted-foreground">{page.path}</TableCell>
            <TableCell>
              <StandingBadge standing={page.standing} />
            </TableCell>
            <TableCell className="px-6">
              <div className="flex items-center justify-end gap-2">
                <Link
                  to="/sites/$siteId/drafts/$draftId/pages/$pageId"
                  params={{ siteId: props.site, draftId: props.draft, pageId: page.id }}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  aria-label={`Edit ${page.title || page.path}`}
                >
                  Edit
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`More for ${page.title || page.path}`}
                      />
                    }
                  >
                    <MoreHorizontalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => props.onRename(page)}>Rename</DropdownMenuItem>
                    {page.standing === "unpublished" ? (
                      <DropdownMenuItem onClick={() => props.onRepublish(page)}>
                        Publish again
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => props.onRemove(page, "unpublish")}>
                        Unpublish
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => props.onRemove(page, "delete")}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** A draft's pages and posts, and sharing and submitting it. */
export function DraftPage(props: {
  readonly viewer: Viewer;
  readonly site: SiteId;
  readonly draft: DraftId;
}) {
  const { data } = useSuspenseQuery(draftPagesQuery(props.site, props.draft));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<PageType>("page");
  const [creating, setCreating] = useState<PageType | null>(null);
  const [renaming, setRenaming] = useState<PageSummary | null>(null);
  const [removing, setRemoving] = useState<{
    readonly page: DraftPageSummary;
    readonly action: "unpublish" | "delete";
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const behind = isBehind(data.draft.base, data.live);
  const review = data.draft.review;
  const byType = (type: PageType) => data.pages.filter((page) => page.type === type);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: draftPagesQuery(props.site, props.draft).queryKey });

  const create = async (type: PageType, values: SubmittedPage) => {
    const page = newPage(type, values, props.viewer.user.name);
    const outcome = await sendBatch(props.site, props.draft, [{ op: "createPage", page }]);
    if (outcome.status === "rejected") return outcome.errors;
    await refresh();
    await navigate({
      to: "/sites/$siteId/drafts/$draftId/pages/$pageId",
      params: { siteId: props.site, draftId: props.draft, pageId: page.id },
    });
    return [];
  };

  const republish = async (page: DraftPageSummary) => {
    await sendBatch(props.site, props.draft, [
      { op: "setStatus", page: page.id, status: "published" },
    ]);
    await refresh();
  };

  const rename = async (page: PageSummary, values: SubmittedPage) => {
    const outcome = await sendBatch(props.site, props.draft, [
      { op: "setMeta", page: page.id, field: "title", value: values.title },
      { op: "setPath", page: page.id, path: values.path },
    ]);
    if (outcome.status === "rejected") return outcome.errors;
    await refresh();
    return [];
  };

  return (
    <AppShell viewer={props.viewer}>
      <header className="flex flex-col gap-3 bg-accent px-10 pt-6 pb-8">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/" />}>Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/sites/$siteId" params={{ siteId: props.site }} />}>
                {data.site.name}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{data.draft.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{data.draft.name}</h1>
          {behind ? (
            <Badge variant="warning">Behind</Badge>
          ) : (
            <Badge variant="secondary">Up to date with live</Badge>
          )}
          {review !== null && review.status._tag !== "Published" && (
            <Badge variant={standing(review).variant}>{standing(review).label}</Badge>
          )}
          <div className="ml-auto">
            <DraftActions
              site={props.site}
              draft={{ id: props.draft, name: data.draft.name }}
              can={data.can}
              onPublished={() => navigate({ to: "/sites/$siteId", params: { siteId: props.site } })}
              submitting={submitting}
              onSubmittingChange={setSubmitting}
            />
          </div>
        </div>
        <p className="text-secondary-foreground">
          Pages and posts in this draft. Edits save to the draft as you make them, and nothing goes
          live until it's published.
        </p>
        {review?.status._tag === "ChangesRequested" && (
          <Alert>
            <AlertTitle>{review.status.by.name} asked for changes</AlertTitle>
            {review.status.note !== "" && <AlertDescription>{review.status.note}</AlertDescription>}
          </Alert>
        )}
      </header>
      {behind && (
        <div className="px-10 pt-6">
          <Alert>
            <GitMergeIcon />
            <AlertTitle>The live site has changed since this draft started</AlertTitle>
            <AlertDescription>
              Bring those changes into the draft before anyone publishes it.
            </AlertDescription>
            <AlertAction>
              <Link
                to="/sites/$siteId/drafts/$draftId/update"
                params={{ siteId: props.site, draftId: props.draft }}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Update draft
              </Link>
            </AlertAction>
          </Alert>
        </div>
      )}
      <div className="px-10 py-8">
        <Tabs value={tab} onValueChange={(value: PageType) => setTab(value)}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <TabsList>
              {(["page", "post"] as const).map((type) => (
                <TabsTrigger key={type} value={type}>
                  {copy[type].tab} ({byType(type).length})
                </TabsTrigger>
              ))}
            </TabsList>
            <Button onClick={() => setCreating(tab)}>
              <PlusIcon />
              {copy[tab].create}
            </Button>
          </div>
          {(["page", "post"] as const).map((type) => (
            <TabsContent key={type} value={type}>
              <Card className="mt-4 gap-0 py-0">
                <CardContent className="px-0">
                  {byType(type).length === 0 ? (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          {type === "page" ? <FileTextIcon /> : <NewspaperIcon />}
                        </EmptyMedia>
                        <EmptyTitle>No {copy[type].tab.toLowerCase()} yet</EmptyTitle>
                        <EmptyDescription>{copy[type].description}</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <PagesTable
                      site={props.site}
                      draft={props.draft}
                      pages={byType(type)}
                      onRename={setRenaming}
                      onRemove={(page, action) => setRemoving({ page, action })}
                      onRepublish={(page) => void republish(page)}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
        <div className="mt-8">
          <MenusCard
            site={props.site}
            draft={props.draft}
            menus={data.menus}
            pages={data.pages.filter((page) => page.type === "page")}
            onSaved={refresh}
          />
        </div>
      </div>
      {removing !== null && (
        <RemovePageDialog
          site={props.site}
          draft={{ id: props.draft, name: data.draft.name }}
          page={removing.page}
          pages={data.pages}
          menus={data.menus}
          action={removing.action}
          onClose={() => setRemoving(null)}
          onDone={async () => {
            setRemoving(null);
            await refresh();
          }}
        />
      )}
      {creating !== null && (
        <PageDialog
          open
          onOpenChange={(open) => {
            if (!open) setCreating(null);
          }}
          heading={copy[creating].create}
          description={copy[creating].description}
          submitLabel={`Create ${creating}`}
          initial={{ title: "", path: copy[creating].prefix }}
          addressPrefix={copy[creating].prefix}
          onSubmit={(values) => create(creating, values)}
        />
      )}
      {renaming !== null && (
        <PageDialog
          open
          onOpenChange={(open) => {
            if (!open) setRenaming(null);
          }}
          heading={`Rename ${renaming.type}`}
          description="The new title and address apply in this draft. The live site changes when it's published."
          submitLabel="Rename"
          initial={{ title: renaming.title, path: renaming.path }}
          addressPrefix={null}
          onSubmit={(values) => rename(renaming, values)}
        />
      )}
    </AppShell>
  );
}
