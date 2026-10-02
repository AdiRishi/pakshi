import type { CheckIssue } from "@repo/contracts/publishing";
import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";
import type { ReactNode } from "react";

import { checkGroups } from "@/features/approvals/describe";

/**
 * The checks a draft must pass, in the order people fix them, each passed or
 * with the issues it found. The submit dialog and the editor's top bar both
 * list them; each shows an issue its own way, as a list item.
 */
export function CheckList(props: {
  readonly issues: ReadonlyArray<CheckIssue>;
  /** An issue as a keyed list item, by its place among its check's issues. */
  readonly renderIssue: (issue: CheckIssue, index: number) => ReactNode;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {checkGroups.map((check) => {
        const found = props.issues.filter((issue) => check.tags.some((tag) => tag === issue._tag));
        return (
          <li key={check.title} className="flex gap-3 text-sm">
            {found.length === 0 ? (
              <CircleCheckIcon
                className="mt-0.5 size-4 shrink-0 text-success-foreground"
                aria-hidden
              />
            ) : (
              <CircleAlertIcon
                className="mt-0.5 size-4 shrink-0 text-warning-foreground"
                aria-hidden
              />
            )}
            <div className="flex min-w-0 grow flex-col gap-1">
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
                  {found.map((issue, index) => props.renderIssue(issue, index))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
