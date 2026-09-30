import type { SiteId, SubmissionId } from "@repo/contracts/ids";
import type { PagePath } from "@repo/contracts/page";
import { type Decision, reviewBasePath, type Review } from "@repo/contracts/studio";
import { currentStep, type Submission } from "@repo/contracts/submission";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Field, FieldError, FieldLabel } from "@repo/ui/components/field";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import { Textarea } from "@repo/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, CheckIcon, CircleAlertIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { formatMoment } from "@/lib/dates";

import { decide } from "../sites/functions";
import { approversOf, describeChange, neededOf, standing } from "./describe";
import { reviewQuery } from "./queries";

type Version = "submitted" | "live";

/** Whether one more approval on a step would complete the submission's last step. */
const completesLastStep = (submission: Submission, step: number) => {
  const needed = submission.steps[step]?.required ?? 1;
  const given = submission.approvals.filter((approval) => approval.step === step).length;
  return step === submission.steps.length - 1 && given + 1 >= needed;
};

/** What changed, by page, each page a button that shows it. */
function Changes(props: {
  readonly review: Review;
  readonly path: PagePath;
  readonly onPage: (path: PagePath) => void;
}) {
  const paths = new Map(props.review.pages.map((page) => [page.id, page.path]));
  const byPlace = Map.groupBy(props.review.changes, (change) => change.place.title);
  return (
    <aside
      aria-labelledby="changes-title"
      className="flex w-80 shrink-0 flex-col gap-5 overflow-y-auto border-r bg-card p-4"
    >
      <h2 id="changes-title" className="px-2 font-semibold">
        {props.review.changes.length === 1 ? "1 change" : `${props.review.changes.length} changes`}
      </h2>
      {props.review.changes.length === 0 && (
        <p className="px-2 text-sm text-muted-foreground">
          This submission is the same as the live site.
        </p>
      )}
      {Array.from(byPlace, ([place, changes]) => {
        const [first] = changes;
        const path =
          first === undefined || first.place.target === "site"
            ? null
            : paths.get(first.place.target);
        return (
          <section key={place} aria-label={place} className="flex flex-col gap-1">
            <h3 className="px-2 text-xs text-muted-foreground">{place}</h3>
            <ul className="flex flex-col gap-1">
              {changes.map((change, index) => (
                <li key={index}>
                  <Button
                    variant={path === props.path ? "secondary" : "ghost"}
                    className="h-auto w-full justify-start py-2 text-left whitespace-normal"
                    disabled={path === null || path === undefined}
                    onClick={() => {
                      if (path !== null && path !== undefined) props.onPage(path);
                    }}
                  >
                    {describeChange(change)}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {props.review.submission.note !== "" && (
        <section aria-labelledby="note-title" className="mt-auto flex flex-col gap-1 px-2">
          <h3 id="note-title" className="text-xs text-muted-foreground">
            Note from {props.review.submission.submittedBy.name}
          </h3>
          <p className="text-sm">{props.review.submission.note}</p>
        </section>
      )}
    </aside>
  );
}

/** Each step, with who approved it, and the one waiting now. */
function Steps(props: { readonly review: Review }) {
  const { submission } = props.review;
  const current = currentStep(submission);
  return (
    <ol aria-label="Approval steps" className="flex flex-col gap-4">
      {submission.steps.map((step, index) => {
        const approvals = submission.approvals.filter((approval) => approval.step === index);
        const done = current === null || index < current;
        return (
          <li key={index} className="flex gap-3">
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-success text-success-foreground" : "bg-accent text-accent-foreground"}`}
            >
              {done ? <CheckIcon className="size-3.5" aria-label="Approved" /> : index + 1}
            </span>
            <span className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{step.name}</span>
              <span className="text-muted-foreground">
                {approversOf(step)}. {neededOf(step)}.
              </span>
              {approvals.map((approval) => (
                <span key={approval.by.id} className="text-muted-foreground">
                  Approved by {approval.by.name}, {formatMoment(approval.at)}
                  {approval.note !== "" && (
                    <span className="mt-1 block rounded-md bg-muted px-3 py-2 text-foreground">
                      {approval.note}
                    </span>
                  )}
                </span>
              ))}
              {index === current && submission.status._tag === "InReview" && (
                <span className="font-medium">Waiting for approval</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The approver's side: the steps so far, and their decision. */
function Decide(props: { readonly review: Review; readonly onDecided: () => Promise<void> }) {
  const noteId = useId();
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();
  const { site, submission, decidable } = props.review;
  const last = decidable.ok && completesLastStep(submission, decidable.step);
  const decision = useMutation({
    mutationFn: (choice: Decision) =>
      decide({
        data: {
          site: site.id,
          submission: submission.id,
          snapshot: submission.snapshot,
          decision: choice,
          note: note.trim(),
        },
      }),
    onSuccess: async (outcome) => {
      await queryClient.invalidateQueries({ queryKey: ["approvals"] });
      switch (outcome._tag) {
        case "Published":
          toast.success(`${submission.draft.name} is published`, {
            description: "It's live within about a minute.",
          });
          return props.onDecided();
        case "Recorded":
          toast.success(
            outcome.submission.status._tag === "ChangesRequested"
              ? `You asked for changes to ${submission.draft.name}`
              : `You approved ${submission.draft.name}`,
          );
          return props.onDecided();
        case "Stale":
          toast.warning("This submission changed while you were looking", {
            description:
              "Another release went live and merged into it. Look again before you decide.",
          });
          return;
        case "Closed":
          toast.warning("This submission is no longer waiting for a decision");
          return props.onDecided();
      }
    },
  });
  const status = standing(submission);
  return (
    <aside
      aria-labelledby="decision-title"
      className="flex w-96 shrink-0 flex-col gap-6 overflow-y-auto border-l bg-card p-5"
    >
      <div className="flex flex-col gap-2">
        <h2 id="decision-title" className="text-lg font-semibold">
          Approval steps
        </h2>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      <Steps review={props.review} />
      {submission.status._tag === "ChangesRequested" && (
        <Alert>
          <AlertTitle>{submission.status.by.name} asked for changes</AlertTitle>
          {submission.status.note !== "" && (
            <AlertDescription>{submission.status.note}</AlertDescription>
          )}
        </Alert>
      )}
      {decidable.ok ? (
        <>
          <p className="rounded-md bg-accent px-4 py-3 text-sm text-accent-foreground">
            {last
              ? "You're the last step. Approving publishes these changes, and the site updates within about a minute."
              : "Approving moves this submission to its next step."}
          </p>
          <p className="text-xs text-muted-foreground">
            If another draft goes live before you decide, this submission updates itself. You're
            asked to approve again only if someone had to settle conflicts.
          </p>
          <Field>
            <FieldLabel htmlFor={noteId}>
              Note to {submission.submittedBy.name}{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Textarea
              id={noteId}
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          {decision.error !== null && <FieldError>{decision.error.message}</FieldError>}
          <div className="mt-auto flex flex-col gap-2">
            <Button
              size="lg"
              disabled={decision.isPending}
              onClick={() => decision.mutate("approve")}
            >
              {last ? "Approve and publish" : "Approve"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={decision.isPending}
              onClick={() => decision.mutate("request-changes")}
            >
              Request changes
            </Button>
          </div>
        </>
      ) : (
        submission.status._tag === "InReview" && (
          <p className="flex gap-2 text-sm text-muted-foreground">
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {decidable.reason}
          </p>
        )
      )}
    </aside>
  );
}

/**
 * A submission as its approvers review it: the pages exactly as they'll be
 * published, or the live site beside them, what changed, and the decision.
 */
export function ReviewPage(props: { readonly site: SiteId; readonly submission: SubmissionId }) {
  const { data } = useSuspenseQuery(reviewQuery(props.site, props.submission));
  const navigate = useNavigate();
  const pages = new Map(data.pages.map((page) => [page.id, page]));
  const changedPaths = data.changes.flatMap((change) => {
    const changed = change.place.target === "site" ? undefined : pages.get(change.place.target);
    return changed === undefined ? [] : [changed.path];
  });
  const [path, setPath] = useState<PagePath>(changedPaths[0] ?? "/");
  const [version, setVersion] = useState<Version>("submitted");
  const page = data.pages.find((candidate) => candidate.path === path);
  const { submission } = data;
  return (
    <div className="flex h-screen flex-col bg-muted">
      <header className="flex flex-wrap items-center gap-4 border-b bg-card px-4 py-2">
        <Link to="/approvals" className="flex items-center gap-1.5 text-sm font-medium">
          <ArrowLeftIcon className="size-4" aria-hidden />
          Approvals
        </Link>
        <div className="flex flex-col">
          <h1 className="font-semibold">Review "{submission.draft.name}"</h1>
          <span className="text-xs text-muted-foreground">
            {data.site.name}, from {submission.submittedBy.name}{" "}
            {formatMoment(submission.submittedAt)}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <NativeSelect
            size="sm"
            aria-label="Page"
            value={path}
            onChange={(event) => {
              const chosen = data.pages.find((candidate) => candidate.path === event.target.value);
              if (chosen !== undefined) setPath(chosen.path);
            }}
          >
            {data.pages.map((candidate) => (
              <NativeSelectOption key={candidate.id} value={candidate.path}>
                {candidate.title || candidate.path}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <ToggleGroup
            aria-label="Show version"
            value={[version]}
            onValueChange={(values) => {
              const chosen = (["submitted", "live"] as const).find((key) => values.includes(key));
              if (chosen !== undefined) setVersion(chosen);
            }}
          >
            <ToggleGroupItem value="submitted">With changes</ToggleGroupItem>
            <ToggleGroupItem value="live">Live site now</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <Changes review={data} path={path} onPage={setPath} />
        <main className="flex min-w-0 flex-1 flex-col p-4">
          <iframe
            key={`${version}${path}`}
            title={`${version === "submitted" ? "Submitted version" : "Live version"} of ${page?.title || path}`}
            src={`${reviewBasePath}/${data.site.id}/${submission.id}${path}?version=${version}`}
            className="min-h-0 flex-1 rounded-md border bg-background"
          />
        </main>
        <Decide review={data} onDecided={() => navigate({ to: "/approvals" })} />
      </div>
    </div>
  );
}
