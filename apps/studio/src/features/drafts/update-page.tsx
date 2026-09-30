import type { DraftId, SiteId } from "@repo/contracts/ids";
import type { Conflict, ConflictKey, MergedChange, Side } from "@repo/contracts/merge";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Progress } from "@repo/ui/components/progress";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, CheckIcon, GitMergeIcon } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { toast } from "sonner";

import { describeChange } from "@/features/approvals/describe";
import { formatDay } from "@/lib/dates";

import { releaseTitle } from "../releases/describe";
import { getDraftUpdate, updateDraft } from "../sites/functions";
import { draftPagesQuery, siteDraftsQuery } from "../sites/queries";
import { ConflictValue } from "./conflict-value";

export const draftUpdateQuery = (site: SiteId, draft: DraftId) =>
  queryOptions({
    queryKey: ["sites", site, "drafts", draft, "update"],
    queryFn: () => getDraftUpdate({ data: { site, draft, resolutions: {} } }),
  });

const sideLabels = { live: "Live site", draft: "This draft" } as const satisfies Record<
  Side,
  string
>;

/** What a conflict is about, as its heading says it. */
const conflictTitle = (conflict: Conflict) => {
  switch (conflict._tag) {
    case "Changed":
      return conflict.block === null
        ? conflict.field
        : `${conflict.field} in ${conflict.block.title}`;
    case "Removed":
      return conflict.block?.title ?? "The whole page";
    case "Reordered":
      return conflict.section === null
        ? "The order of the page's sections"
        : `The order of items in ${conflict.section.title}`;
    case "Address":
      return `The address ${conflict.path}`;
  }
};

const conflictContext = (conflict: Conflict) => {
  switch (conflict._tag) {
    case "Changed":
      return `${conflict.place.title}. Both sides changed it, differently.`;
    case "Removed":
      return conflict.removedOn === "live"
        ? `${conflict.place.title}. Removed on the live site, changed in this draft.`
        : `${conflict.place.title}. Removed in this draft, changed on the live site.`;
    case "Reordered":
      return `${conflict.place.title}. Both sides moved them, differently.`;
    case "Address":
      return "A page on each side took this address. Keeping one side's page removes the other's from this draft.";
  }
};

/** One side of a conflict, and the button that keeps it. */
function SideChoice(props: {
  readonly label: string;
  readonly chosen: boolean;
  readonly keep: string;
  readonly onChoose: () => void;
  readonly children: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border p-4 ${props.chosen ? "border-ring bg-accent" : ""}`}
    >
      <span className="text-xs font-semibold text-muted-foreground">{props.label}</span>
      <div className="min-w-0">{props.children}</div>
      <Button
        variant={props.chosen ? "secondary" : "outline"}
        size="sm"
        className="mt-auto self-start"
        aria-pressed={props.chosen}
        onClick={props.onChoose}
      >
        {props.chosen && <CheckIcon aria-hidden />}
        {props.keep}
      </Button>
    </div>
  );
}

/** What one side of a conflict holds. */
function SideContent(props: { readonly conflict: Conflict; readonly side: Side }) {
  const { conflict, side } = props;
  switch (conflict._tag) {
    case "Changed":
      return <ConflictValue kind={conflict.kind} value={conflict[side]} />;
    case "Removed":
      return conflict.removedOn === side ? (
        <span className="text-muted-foreground">Removed</span>
      ) : (
        <span>Kept, with its changes</span>
      );
    case "Reordered":
      return (
        <ol className="list-decimal pl-5 text-sm">
          {conflict[side].map((block) => (
            <li key={block.id}>{block.title}</li>
          ))}
        </ol>
      );
    case "Address":
      return <span className="font-medium">{conflict[side].title}</span>;
  }
}

const keepLabels = (conflict: Conflict): Record<Side, string> => {
  if (conflict._tag === "Removed")
    return conflict.removedOn === "live"
      ? { live: "Remove it", draft: "Keep it with your edits" }
      : { live: "Keep it with live's changes", draft: "Keep it removed" };
  if (conflict._tag === "Address")
    return { live: "Keep live's page", draft: "Keep this draft's page" };
  return { live: "Keep live", draft: "Keep this draft" };
};

function ConflictCard(props: {
  readonly conflict: Conflict;
  readonly number: number;
  readonly chosen: Side | undefined;
  readonly onChoose: (side: Side) => void;
}) {
  const titleId = useId();
  const keep = keepLabels(props.conflict);
  return (
    <section aria-labelledby={titleId}>
      <Card className={props.chosen === undefined ? "border-warning-foreground/40" : ""}>
        <CardHeader className="flex flex-row items-center gap-3">
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-ring text-xs font-bold"
          >
            {props.chosen === undefined ? props.number : <CheckIcon className="size-3.5" />}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <CardTitle>
              <h3 id={titleId} className="text-base font-semibold">
                {conflictTitle(props.conflict)}
              </h3>
            </CardTitle>
            <p className="text-sm text-muted-foreground">{conflictContext(props.conflict)}</p>
          </div>
          <Badge variant={props.chosen === undefined ? "warning" : "success"} className="ml-auto">
            {props.chosen === undefined ? "Needs a decision" : "Decided"}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {(["live", "draft"] as const).map((side) => (
            <SideChoice
              key={side}
              label={sideLabels[side]}
              chosen={props.chosen === side}
              keep={keep[side]}
              onChoose={() => props.onChoose(side)}
            >
              <SideContent conflict={props.conflict} side={side} />
            </SideChoice>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function MergedChanges(props: { readonly changes: ReadonlyArray<MergedChange> }) {
  const byPlace = Map.groupBy(props.changes, (change) => change.place.title);
  return (
    <aside aria-labelledby="merged-title" className="flex flex-col gap-4">
      <h2 id="merged-title" className="flex items-center gap-2 text-lg font-semibold">
        <GitMergeIcon className="size-5" aria-hidden />
        {props.changes.length === 1
          ? "1 change merges on its own"
          : `${props.changes.length} changes merge on their own`}
      </h2>
      <p className="text-sm text-muted-foreground">
        These changes from the live site don't touch anything this draft changed, so Pakshi brings
        them in.
      </p>
      {byPlace.size > 0 && (
        <Card className="gap-0 py-0">
          <CardContent className="flex flex-col divide-y px-0">
            {Array.from(byPlace, ([place, changes]) => (
              <div key={place} className="flex flex-col gap-1 px-4 py-3">
                <span className="font-medium">{place}</span>
                <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {changes.map((change, index) => (
                    // Changes have no identity; the list is rebuilt whole each time.
                    // oxlint-disable-next-line react/no-array-index-key
                    <li key={index}>{describeChange(change)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <p className="rounded-lg bg-accent p-3 text-sm">
        Nothing goes live when you finish. The draft then starts from the live site, and people can
        keep editing or publish it.
      </p>
    </aside>
  );
}

/** Settles a behind draft's conflicts, and merges the live release into it. */
export function UpdatePage(props: { readonly site: SiteId; readonly draft: DraftId }) {
  const { data } = useSuspenseQuery(draftUpdateQuery(props.site, props.draft));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [chosen, setChosen] = useState<Record<ConflictKey, Side>>({});
  const conflicts = data.conflicts;
  const decided = conflicts.filter((conflict) => conflict.key in chosen).length;
  const remaining = conflicts.length - decided;
  const reasonId = useId();

  const finish = useMutation({
    mutationFn: () =>
      updateDraft({
        data: { site: props.site, draft: props.draft, resolutions: chosen, seen: data.to.id },
      }),
    onSuccess: async (outcome) => {
      if (outcome._tag === "Unresolved") {
        // Sides chosen against the release that was live may not fit the one that is now.
        setChosen({});
        toast.warning("The live site changed again", {
          description: "Choose a side for each conflict again, then finish the update.",
        });
        await queryClient.invalidateQueries({
          queryKey: draftUpdateQuery(props.site, props.draft).queryKey,
        });
        return;
      }
      toast.success(`${data.draft.name} is up to date with the live site`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: siteDraftsQuery(props.site).queryKey }),
        queryClient.invalidateQueries({
          queryKey: draftPagesQuery(props.site, props.draft).queryKey,
        }),
      ]);
      await navigate({
        to: "/sites/$siteId/drafts/$draftId",
        params: { siteId: props.site, draftId: props.draft },
      });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-4 border-b bg-card px-4 py-3">
        <Link
          to="/sites/$siteId/drafts/$draftId"
          params={{ siteId: props.site, draftId: props.draft }}
          aria-label={`Back to ${data.draft.name}`}
          className={buttonVariants({ variant: "ghost", size: "icon" })}
        >
          <ArrowLeftIcon />
        </Link>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">{data.site.name}</span>
          <span className="font-semibold">Update draft</span>
        </div>
        <Badge variant="secondary">{data.draft.name}</Badge>
        <Badge variant="warning">Behind</Badge>
        <div className="ml-auto flex items-center gap-3">
          {remaining > 0 && (
            <span id={reasonId} className="text-sm text-muted-foreground">
              {remaining === 1
                ? "Decide on 1 more conflict to finish"
                : `Decide on ${remaining} more conflicts to finish`}
            </span>
          )}
          <Button
            disabled={remaining > 0 || finish.isPending}
            aria-describedby={remaining > 0 ? reasonId : undefined}
            onClick={() => finish.mutate()}
          >
            Finish update
          </Button>
        </div>
      </header>
      <div className="grid flex-1 gap-8 bg-background px-10 py-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <main className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Bring this draft up to date</h1>
            <p className="max-w-3xl text-secondary-foreground">
              This draft started from "{releaseTitle(data.from)}", live since{" "}
              {formatDay(data.from.at)}. Since then, "{releaseTitle(data.to)}" went live on{" "}
              {formatDay(data.to.at)}. Bring those changes in before anyone publishes this draft.
            </p>
          </div>
          {conflicts.length > 0 && (
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold">
                {conflicts.length === 1
                  ? "1 conflict needs a decision"
                  : `${conflicts.length} conflicts need a decision`}
              </h2>
              <span className="ml-auto text-sm font-semibold">
                {decided} of {conflicts.length} decided
              </span>
              <Progress
                value={(decided / conflicts.length) * 100}
                aria-label="Conflicts decided"
                className="w-40"
              />
            </div>
          )}
          {conflicts.map((conflict, index) => (
            <ConflictCard
              key={conflict.key}
              conflict={conflict}
              number={index + 1}
              chosen={chosen[conflict.key]}
              onChoose={(side) => setChosen((current) => ({ ...current, [conflict.key]: side }))}
            />
          ))}
        </main>
        <MergedChanges changes={data.changes} />
      </div>
    </div>
  );
}
