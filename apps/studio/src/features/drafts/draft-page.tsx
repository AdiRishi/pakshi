import { isBehind } from "@repo/contracts/draft";
import type { DraftId, SiteId } from "@repo/contracts/ids";
import type { Op } from "@repo/contracts/ops";
import type { Viewer } from "@repo/contracts/studio";
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
import { buttonVariants } from "@repo/ui/components/button";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { GitMergeIcon } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { standing } from "@/features/approvals/describe";

import { draftPagesQuery } from "../sites/queries";
import { sendBatch } from "../sites/send-batch";
import { DraftActions } from "./draft-actions";
import { MenusCard } from "./menus-card";
import { PagesTree } from "./pages-tree";

/** A draft's pages, and sharing and submitting it. */
export function DraftPage(props: {
  readonly viewer: Viewer;
  readonly site: SiteId;
  readonly draft: DraftId;
}) {
  const { data } = useSuspenseQuery(draftPagesQuery(props.site, props.draft));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const behind = isBehind(data.draft.base, data.live);
  const review = data.draft.review;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: draftPagesQuery(props.site, props.draft).queryKey });

  const send = async (ops: ReadonlyArray<Op>) => {
    const outcome = await sendBatch(props.site, props.draft, ops);
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
          Pages in this draft. Edits save to the draft as you make them, and nothing goes live until
          it's published.
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
      <div className="flex flex-col gap-10 px-10 py-8">
        <PagesTree
          site={props.site}
          draft={{ id: props.draft, name: data.draft.name }}
          pages={data.pages}
          menus={data.menus}
          lockfile={data.lockfile}
          author={props.viewer.user.name}
          send={send}
          onCreated={(page) =>
            navigate({
              to: "/sites/$siteId/drafts/$draftId/pages/$pageId",
              params: { siteId: props.site, draftId: props.draft, pageId: page },
            })
          }
        />
        <MenusCard
          site={props.site}
          draft={props.draft}
          menus={data.menus}
          pages={data.pages}
          onSaved={refresh}
        />
      </div>
    </AppShell>
  );
}
