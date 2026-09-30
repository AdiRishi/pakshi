import type { DraftId, SiteId } from "@repo/contracts/ids";
import type { PreflightIssue } from "@repo/contracts/publishing";
import type { Release } from "@repo/contracts/release";
import type { SubmissionCheck } from "@repo/contracts/studio";
import type { Submission } from "@repo/contracts/submission";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Textarea } from "@repo/ui/components/textarea";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleAlertIcon, CircleCheckIcon, LoaderIcon } from "lucide-react";
import { useId, useState } from "react";

import {
  approversOf,
  describeIssue,
  neededOf,
  preflightChecks,
} from "@/features/approvals/describe";

import { getSubmissionCheck, submitDraft } from "../sites/functions";

const checkQuery = (site: SiteId, draft: DraftId) =>
  queryOptions({
    queryKey: ["sites", site, "drafts", draft, "submission-check"],
    queryFn: () => getSubmissionCheck({ data: { site, draft } }),
    staleTime: 0,
  });

const workflowSource = {
  site: "this site's",
  brand: "the brand's",
  organization: "the organization's",
};

/** Pre-flight's checks, each passed or with what's left to fix and a link to its page. */
function Checks(props: {
  readonly site: SiteId;
  readonly draft: DraftId;
  readonly issues: ReadonlyArray<PreflightIssue>;
}) {
  return (
    <section aria-labelledby="checks-title" className="flex flex-col gap-3">
      <h3 id="checks-title" className="font-semibold">
        Checks before submitting
      </h3>
      <ul className="flex flex-col gap-3">
        {preflightChecks.map((check) => {
          const found = props.issues.filter((issue) =>
            check.tags.some((tag) => tag === issue._tag),
          );
          return (
            <li key={check.title} className="flex gap-3 text-sm">
              {found.length === 0 ? (
                <CircleCheckIcon
                  className="mt-0.5 size-4 shrink-0 text-success-foreground"
                  aria-hidden
                />
              ) : (
                <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              )}
              <div className="flex flex-col gap-1">
                <span className="font-medium">
                  {check.title}
                  <span className="sr-only">
                    {found.length === 0 ? ": passed" : ": needs fixing"}
                  </span>
                </span>
                {found.length === 0 ? (
                  <span className="text-muted-foreground">{check.passed}</span>
                ) : (
                  <ul className="flex flex-col gap-1 text-muted-foreground">
                    {found.map((issue, index) => {
                      const { page, text } = describeIssue(issue);
                      return (
                        <li key={index}>
                          {text}.{" "}
                          {page !== null && (
                            <Link
                              to="/sites/$siteId/drafts/$draftId/pages/$pageId"
                              params={{ siteId: props.site, draftId: props.draft, pageId: page }}
                              className="text-foreground underline underline-offset-4"
                            >
                              Go to it
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Who reviews a submission: the workflow's steps in order, or no one. */
function Reviewers(props: { readonly workflow: SubmissionCheck["workflow"] }) {
  const { steps, from } = props.workflow;
  return (
    <section aria-labelledby="reviewers-title" className="flex flex-col gap-3">
      <h3 id="reviewers-title" className="font-semibold">
        Who will review it
      </h3>
      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No one: this site's changes go live without approval. Submitting publishes the draft.
        </p>
      ) : (
        <>
          <ol className="flex flex-col gap-2">
            {steps.map((step, index) => (
              <li key={index} className="flex gap-3 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                  {index + 1}
                </span>
                <span className="flex flex-col">
                  <span className="font-medium">{step.name}</span>
                  <span className="text-muted-foreground">
                    {approversOf(step)}. {neededOf(step)}.
                  </span>
                </span>
              </li>
            ))}
          </ol>
          {from !== null && (
            <p className="text-xs text-muted-foreground">
              These steps are {workflowSource[from]} approval workflow.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Submits a draft through its site's approval workflow, after showing what
 * pre-flight finds and who reviews it. With no steps, submitting publishes.
 * A draft that's behind merges first, and one whose merge needs a person
 * goes to its update instead.
 */
export function SubmitDialog(props: {
  readonly site: SiteId;
  readonly draft: { readonly id: DraftId; readonly name: string };
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmitted: (submission: Submission) => Promise<void>;
  readonly onPublished: (release: Release) => Promise<void>;
  readonly onNeedsUpdate: () => Promise<void>;
}) {
  const noteId = useId();
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();
  const query = checkQuery(props.site, props.draft.id);
  const check = useQuery({ ...query, enabled: props.open });
  // Closing forgets the attempt: fields may be filled in, or its error gone, by the next one.
  const close = () => {
    submit.reset();
    setNote("");
    props.onOpenChange(false);
  };
  const submit = useMutation({
    mutationFn: () =>
      submitDraft({ data: { site: props.site, draft: props.draft.id, note: note.trim() } }),
    onSuccess: async (outcome) => {
      switch (outcome._tag) {
        case "Submitted":
          close();
          return props.onSubmitted(outcome.submission);
        case "Published":
          close();
          return props.onPublished(outcome.release);
        case "Blocked":
          return queryClient.setQueryData(query.queryKey, (current) =>
            current === undefined ? current : { ...current, issues: outcome.issues },
          );
        case "NeedsUpdate":
          close();
          return props.onNeedsUpdate();
      }
    },
  });
  const data = check.data;
  const publishes = data?.workflow.steps.length === 0;
  const blocked = data !== undefined && data.issues.length > 0;

  return (
    <Dialog open={props.open} onOpenChange={(open) => (open ? props.onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {publishes
              ? `Publish "${props.draft.name}"`
              : `Submit "${props.draft.name}" for approval`}
          </DialogTitle>
          <DialogDescription>
            {publishes
              ? "Publishing freezes the draft as it is now and makes it live within about a minute. Edits anyone makes meanwhile stay in the draft for next time."
              : "Submitting freezes the draft as it is now. Approvers review that version, and it's what gets published. You can keep editing, but later edits aren't part of this submission."}
          </DialogDescription>
        </DialogHeader>
        {data === undefined ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Checking the draft">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <Checks site={props.site} draft={props.draft.id} issues={data.issues} />
            {data.behind && (
              <p className="text-sm text-muted-foreground">
                The live site changed since this draft started. Submitting brings those changes in
                first.
              </p>
            )}
            <Reviewers workflow={data.workflow} />
            {!publishes && (
              <Field>
                <FieldLabel htmlFor={noteId}>
                  Note for reviewers{" "}
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
            )}
          </div>
        )}
        {(submit.error ?? check.error) !== null && (
          <FieldError>{(submit.error ?? check.error)?.message}</FieldError>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={data === undefined || blocked || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending && <LoaderIcon className="animate-spin" aria-hidden />}
            {blocked
              ? data.issues.length === 1
                ? "Fix 1 issue to submit"
                : `Fix ${data.issues.length} issues to submit`
              : publishes
                ? submit.isPending
                  ? "Publishing"
                  : "Publish"
                : submit.isPending
                  ? "Submitting"
                  : "Submit for approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
