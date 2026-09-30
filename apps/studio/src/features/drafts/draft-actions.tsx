import type { DraftId, SiteId } from "@repo/contracts/ids";
import type { SiteAbilities } from "@repo/contracts/studio";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { EyeIcon, SendIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { previewPath } from "@/features/preview/address";

import { ShareDialog } from "./share-dialog";
import { SubmitDialog } from "./submit-dialog";

/**
 * What someone can do with a draft beyond editing it: share it, open its
 * preview, and submit it through the site's workflow.
 */
export function DraftActions(props: {
  readonly site: SiteId;
  readonly draft: { readonly id: DraftId; readonly name: string };
  readonly can: SiteAbilities;
  /** After the draft publishes, which closes it unless it was edited meanwhile. */
  readonly onPublished: () => Promise<void>;
}) {
  const [sharing, setSharing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["sites", props.site, "drafts"] });
  return (
    <div className="flex items-center gap-2">
      {props.can.share && (
        <Button variant="outline" onClick={() => setSharing(true)}>
          <UsersIcon />
          Share
        </Button>
      )}
      <a
        href={previewPath(props.site, props.draft.id)}
        target="_blank"
        rel="noopener"
        className={buttonVariants({ variant: "outline" })}
      >
        <EyeIcon />
        Preview
      </a>
      {props.can.publish && (
        <Button onClick={() => setSubmitting(true)}>
          <SendIcon />
          Submit
        </Button>
      )}
      <ShareDialog site={props.site} draft={props.draft} open={sharing} onOpenChange={setSharing} />
      <SubmitDialog
        site={props.site}
        draft={props.draft}
        open={submitting}
        onOpenChange={setSubmitting}
        onSubmitted={async () => {
          toast.success(`${props.draft.name} is sent for approval`, {
            description:
              "Its approvers are told by email. It goes live when the last step approves.",
          });
          await refresh();
        }}
        onPublished={async () => {
          toast.success(`${props.draft.name} is published`, {
            description: "It's live within about a minute.",
          });
          await refresh();
          await props.onPublished();
        }}
        onNeedsUpdate={() =>
          navigate({
            to: "/sites/$siteId/drafts/$draftId/update",
            params: { siteId: props.site, draftId: props.draft.id },
          })
        }
      />
    </div>
  );
}
