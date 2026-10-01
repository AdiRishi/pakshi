import type { DraftId, SiteId } from "@repo/contracts/ids";
import { usePage } from "@repo/editor";
import { buttonVariants } from "@repo/ui/components/button";
import { Link } from "@tanstack/react-router";
import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";

import { useDraftChecks } from "./checks-panel";

/** How many things the checks found in the draft, opening the checks panel beside the page. */
export function ChecksButton(props: { readonly site: SiteId; readonly draft: DraftId }) {
  const checks = useDraftChecks(props.site, props.draft);
  const page = usePage();
  const count = checks.data?.issues.length;
  if (count === undefined) return null;
  return (
    <Link
      to="/sites/$siteId/drafts/$draftId/pages/$pageId"
      params={{ siteId: props.site, draftId: props.draft, pageId: page }}
      search={(previous) => ({ checks: previous.checks ?? "" })}
      className={buttonVariants({
        variant: "outline",
        className:
          count === 0
            ? "text-success-foreground"
            : "border-warning bg-warning text-warning-foreground hover:bg-warning/80",
      })}
    >
      {count === 0 ? <CircleCheckIcon /> : <TriangleAlertIcon />}
      {count === 0 ? "Checks pass" : count === 1 ? "1 thing to fix" : `${count} things to fix`}
    </Link>
  );
}
