import type { DraftId, SiteId } from "@repo/contracts/ids";
import type { Incomplete } from "@repo/contracts/publishing";
import type { Release } from "@repo/contracts/release";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { FieldError } from "@repo/ui/components/field";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleAlertIcon, LoaderIcon } from "lucide-react";
import { useState } from "react";

import { publishDraft } from "../sites/functions";

/** The fields a draft must fill in before it can go live, each with a link to its page. */
function IncompleteFields(props: {
  readonly site: SiteId;
  readonly draft: DraftId;
  readonly incomplete: ReadonlyArray<Incomplete>;
}) {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>
        {props.incomplete.length === 1
          ? "1 field needs filling in first"
          : `${props.incomplete.length} fields need filling in first`}
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-2 flex flex-col gap-2">
          {props.incomplete.map((field) => (
            <li key={`${field.place.target}/${field.block.id}/${field.path.join("/")}`}>
              <span className="font-medium text-foreground">
                {field.field} in {field.block.title}
              </span>
              , {field.place.title}: {field.message}.{" "}
              {field.place.target !== "site" && (
                <Link
                  to="/sites/$siteId/drafts/$draftId/pages/$pageId"
                  params={{ siteId: props.site, draftId: props.draft, pageId: field.place.target }}
                  className="text-foreground underline underline-offset-4"
                >
                  Go to it
                </Link>
              )}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Publishes a draft. Every workflow has no approval steps yet, so publishing
 * is what submitting does. A draft that's behind merges first, and one whose
 * merge needs a person goes to its update instead.
 */
export function PublishDialog(props: {
  readonly site: SiteId;
  readonly draft: { readonly id: DraftId; readonly name: string };
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPublished: (release: Release) => Promise<void>;
  readonly onNeedsUpdate: () => Promise<void>;
}) {
  const [incomplete, setIncomplete] = useState<ReadonlyArray<Incomplete>>([]);
  const publish = useMutation({
    mutationFn: () => publishDraft({ data: { site: props.site, draft: props.draft.id } }),
    onSuccess: async (outcome) => {
      switch (outcome._tag) {
        case "Published":
          props.onOpenChange(false);
          return props.onPublished(outcome.release);
        case "Incomplete":
          return setIncomplete(outcome.incomplete);
        case "NeedsUpdate":
          props.onOpenChange(false);
          return props.onNeedsUpdate();
      }
    },
  });

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Publish "{props.draft.name}"</DialogTitle>
          <DialogDescription>
            Publishing freezes the draft as it is now and makes it live within about a minute. Edits
            anyone makes while it publishes stay in the draft for next time.
          </DialogDescription>
        </DialogHeader>
        {incomplete.length > 0 && (
          <IncompleteFields site={props.site} draft={props.draft.id} incomplete={incomplete} />
        )}
        {publish.error !== null && <FieldError>{publish.error.message}</FieldError>}
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={publish.isPending} onClick={() => publish.mutate()}>
            {publish.isPending && <LoaderIcon className="animate-spin" aria-hidden />}
            {publish.isPending ? "Publishing" : incomplete.length > 0 ? "Try again" : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
