import { PageId, randomId, type SiteId } from "@repo/contracts/ids";
import type { PageDocument } from "@repo/contracts/page";
import type { PageSummary, Viewer } from "@repo/contracts/studio";
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
import { FileTextIcon, MoreHorizontalIcon, NewspaperIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";

import { PageDialog, type SubmittedPage } from "./page-dialog";
import { sitePagesQuery } from "./queries";
import { sendBatch } from "./send-batch";

type PageType = PageSummary["type"];

const copy = {
  page: {
    tab: "Pages",
    create: "New page",
    description:
      "The page starts empty in this site's draft. Nothing goes live until it's published.",
    prefix: "/",
  },
  post: {
    tab: "Blog posts",
    create: "New post",
    description:
      "The post starts empty in this site's draft. Nothing goes live until it's published.",
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
  readonly pages: ReadonlyArray<PageSummary>;
  readonly onRename: (page: PageSummary) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="px-6">Title</TableHead>
          <TableHead>Address</TableHead>
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
            <TableCell className="px-6">
              <div className="flex items-center justify-end gap-2">
                <Link
                  to="/sites/$siteId/pages/$pageId"
                  params={{ siteId: props.site, pageId: page.id }}
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

export function PagesPage(props: { readonly viewer: Viewer; readonly site: SiteId }) {
  const { data } = useSuspenseQuery(sitePagesQuery(props.site));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<PageType>("page");
  const [creating, setCreating] = useState<PageType | null>(null);
  const [renaming, setRenaming] = useState<PageSummary | null>(null);
  const byType = (type: PageType) => data.pages.filter((page) => page.type === type);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: sitePagesQuery(props.site).queryKey });

  const create = async (type: PageType, values: SubmittedPage) => {
    const page = newPage(type, values, props.viewer.user.name);
    const outcome = await sendBatch(props.site, [{ op: "createPage", page }]);
    if (outcome.status === "rejected") return outcome.errors;
    await refresh();
    await navigate({
      to: "/sites/$siteId/pages/$pageId",
      params: { siteId: props.site, pageId: page.id },
    });
    return [];
  };

  const rename = async (page: PageSummary, values: SubmittedPage) => {
    const outcome = await sendBatch(props.site, [
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
              <BreadcrumbPage>{data.site.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="text-3xl font-semibold tracking-tight">{data.site.name}</h1>
        <p className="text-secondary-foreground">
          Pages and posts in this site's draft. Edits save to the draft as you make them.
        </p>
      </header>
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
                    <PagesTable site={props.site} pages={byType(type)} onRename={setRenaming} />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
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
          description="The new title and address apply in this draft. The live site changes when the draft is published."
          submitLabel="Rename"
          initial={{ title: renaming.title, path: renaming.path }}
          addressPrefix={null}
          onSubmit={(values) => rename(renaming, values)}
        />
      )}
    </AppShell>
  );
}
