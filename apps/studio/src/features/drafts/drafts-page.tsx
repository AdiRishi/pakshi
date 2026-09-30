import { isBehind } from "@repo/contracts/draft";
import type { DraftId, SiteId } from "@repo/contracts/ids";
import { liveReleaseOf } from "@repo/contracts/release";
import type { DraftSummary, Viewer } from "@repo/contracts/studio";
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
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon, FilePenIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { standing } from "@/features/approvals/describe";
import { formatDay, formatMoment } from "@/lib/dates";

import { closeDraft, createDraft, renameDraft } from "../sites/functions";
import { siteDraftsQuery } from "../sites/queries";
import { SiteHeader } from "../sites/site-header";
import { DraftNameDialog } from "./draft-name-dialog";
import { previewPath } from "./share-dialog";

/** Everyone who has changed a draft, or who started it when no one has yet. */
const peopleOf = (draft: DraftSummary) =>
  (draft.people.length === 0 ? [draft.createdBy] : draft.people)
    .map((person) => person.name)
    .join(", ");

/** Where a draft stands: in review or back from it, behind the live site, or up to date. */
const statusOf = (draft: DraftSummary, behind: boolean) => {
  const review = draft.review;
  if (
    review !== null &&
    (review.status._tag === "InReview" ||
      review.status._tag === "ChangesRequested" ||
      review.status._tag === "NeedsUpdate")
  )
    return standing(review);
  return behind
    ? ({ label: "Behind: update needed", variant: "warning" } as const)
    : ({ label: "Up to date", variant: "secondary" } as const);
};

/** Who a draft is shared with, in a few words. */
const sharingOf = (draft: DraftSummary) => {
  const { people, general } = draft.sharing;
  const can = general.access === "edit" ? "can edit" : "can view";
  if (general.audience === "link") return `Anyone with the link ${can}`;
  if (general.audience === "organization") return `Everyone in the organization ${can}`;
  if (people.length === 0) return "Site editors only";
  return people.length === 1
    ? `Shared with ${people[0]?.person.name}`
    : `Shared with ${people.length} people`;
};

const lastActivity = (draft: DraftSummary) =>
  draft.lastEdit === null
    ? `Started ${formatDay(draft.createdAt)}`
    : `${draft.lastEdit.by.name}, ${formatMoment(draft.lastEdit.at)}`;

function OpenDrafts(props: {
  readonly site: SiteId;
  readonly drafts: ReadonlyArray<DraftSummary>;
  readonly behind: (draft: DraftSummary) => boolean;
  readonly onRename: (draft: DraftSummary) => void;
  readonly onClose: (draft: DraftSummary) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="px-6">Draft</TableHead>
          <TableHead>People</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Sharing</TableHead>
          <TableHead>Last activity</TableHead>
          <TableHead className="w-0 px-6">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.drafts.map((draft) => (
          <TableRow key={draft.id}>
            <TableCell className="px-6 font-medium">
              <Link
                to="/sites/$siteId/drafts/$draftId"
                params={{ siteId: props.site, draftId: draft.id }}
                className="underline-offset-4 hover:underline"
              >
                {draft.name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{peopleOf(draft)}</TableCell>
            <TableCell>
              <Badge variant={statusOf(draft, props.behind(draft)).variant}>
                {statusOf(draft, props.behind(draft)).label}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">{sharingOf(draft)}</TableCell>
            <TableCell className="text-muted-foreground">{lastActivity(draft)}</TableCell>
            <TableCell className="px-6">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon-sm" aria-label={`More for ${draft.name}`} />
                  }
                >
                  <MoreHorizontalIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      window.open(previewPath(props.site, draft.id), "_blank", "noopener")
                    }
                  >
                    Open preview
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => props.onRename(draft)}>Rename</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => props.onClose(draft)}>
                    Close without publishing
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ClosedDrafts(props: { readonly drafts: ReadonlyArray<DraftSummary> }) {
  const [expanded, setExpanded] = useState(false);
  if (props.drafts.length === 0) return null;
  return (
    <section aria-label="Published and closed drafts" className="flex flex-col gap-3">
      <Button
        variant="ghost"
        className="self-start"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <ChevronDownIcon className={expanded ? "" : "-rotate-90"} aria-hidden />
        Published and closed ({props.drafts.length})
      </Button>
      {expanded && (
        <Card className="gap-0 py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-6">Draft</TableHead>
                  <TableHead>People</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.drafts.map((draft) => (
                  <TableRow key={draft.id}>
                    <TableCell className="px-6 font-medium">{draft.name}</TableCell>
                    <TableCell className="text-muted-foreground">{peopleOf(draft)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {draft.status === "published" ? "Published" : "Closed"}
                      {draft.closedAt !== null && ` ${formatDay(draft.closedAt)}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

/** A site's drafts: each one a separate set of changes to the live site. */
export function DraftsPage(props: { readonly viewer: Viewer; readonly site: SiteId }) {
  const { data } = useSuspenseQuery(siteDraftsQuery(props.site));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<DraftSummary | null>(null);
  const [closing, setClosing] = useState<DraftSummary | null>(null);
  const live = liveReleaseOf(data.live);
  const open = data.drafts.filter((draft) => draft.status === "open");
  const closed = data.drafts.filter((draft) => draft.status !== "open");
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: siteDraftsQuery(props.site).queryKey });

  const close = useMutation({
    mutationFn: (draft: DraftId) => closeDraft({ data: { site: props.site, draft } }),
    onSuccess: refresh,
    onError: (error) => toast.error(error.message),
  });

  const newDraft = (
    <Button onClick={() => setCreating(true)}>
      <PlusIcon />
      New draft
    </Button>
  );

  return (
    <AppShell viewer={props.viewer}>
      <SiteHeader
        site={data.site}
        section="drafts"
        description="Each draft is a separate set of changes. When one goes live, the others update to include it."
        actions={newDraft}
      />
      <div className="flex flex-col gap-6 px-10 py-8">
        <h2 className="text-xl font-semibold">
          {open.length === 1 ? "1 open draft" : `${open.length} open drafts`}
        </h2>
        <Card className="gap-0 py-0">
          <CardContent className="px-0">
            {open.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FilePenIcon />
                  </EmptyMedia>
                  <EmptyTitle>No open drafts</EmptyTitle>
                  <EmptyDescription>
                    Start a draft to change the site. Nothing goes live until it's published.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <OpenDrafts
                site={props.site}
                drafts={open}
                behind={(draft) => isBehind(draft.base, live)}
                onRename={setRenaming}
                onClose={setClosing}
              />
            )}
          </CardContent>
        </Card>
        <ClosedDrafts drafts={closed} />
      </div>
      {creating && (
        <DraftNameDialog
          open
          onOpenChange={setCreating}
          heading="New draft"
          description="The draft starts from what's live now. Nothing goes live until it's published."
          submitLabel="Start draft"
          initial=""
          onSubmit={async (name) => {
            const draft = await createDraft({ data: { site: props.site, name } });
            await refresh();
            await navigate({
              to: "/sites/$siteId/drafts/$draftId",
              params: { siteId: props.site, draftId: draft.id },
            });
          }}
        />
      )}
      {renaming !== null && (
        <DraftNameDialog
          open
          onOpenChange={(isOpen) => {
            if (!isOpen) setRenaming(null);
          }}
          heading="Rename draft"
          description="Everyone working on the draft sees the new name."
          submitLabel="Rename"
          initial={renaming.name}
          onSubmit={async (name) => {
            await renameDraft({ data: { site: props.site, draft: renaming.id, name } });
            await refresh();
          }}
        />
      )}
      <AlertDialog
        open={closing !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setClosing(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close "{closing?.name}" without publishing?</AlertDialogTitle>
            <AlertDialogDescription>
              Its changes never go live, and no one can edit it again. Anyone editing it now is told
              it closed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it open</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (closing !== null) close.mutate(closing.id);
                setClosing(null);
              }}
            >
              Close draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
