import type { DraftId, PageId, SiteId } from "@repo/contracts/ids";
import type { CheckIssue } from "@repo/contracts/publishing";
import {
  useConfirmedRevision,
  useDeselect,
  useDraftView,
  usePage,
  useShowBlock,
} from "@repo/editor";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  FileTextIcon,
  SendIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { describeIssue } from "@/features/approvals/describe";

import { fixPlaceOf, hintFor, issueKey } from "./issues";
import { checkQuery } from "./queries";

/** How long the panel waits after the last confirmed change before it checks the draft again. */
const settle = 800;

/** The draft's revision, once it has stopped changing for a moment. */
const useSettledRevision = () => {
  const revision = useConfirmedRevision();
  const [settled, setSettled] = useState(revision);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(revision), settle);
    return () => clearTimeout(timer);
  }, [revision]);
  return settled;
};

/** What the checks find in the draft now, checked again as people change it. */
export const useDraftChecks = (site: SiteId, draft: DraftId) =>
  useQuery({
    ...checkQuery(site, draft, useSettledRevision()),
    placeholderData: keepPreviousData,
  });

interface Group {
  readonly key: string;
  readonly title: string;
  readonly page: PageId | null;
  readonly issues: ReadonlyArray<CheckIssue>;
}

/** The issues grouped by the page they're on, in the order the panel steps through them. */
const groupsOf = (
  issues: ReadonlyArray<CheckIssue>,
  pageTitle: (page: PageId) => string,
): ReadonlyArray<Group> => {
  const groups = new Map<
    string,
    { title: string; page: PageId | null; issues: Array<CheckIssue> }
  >();
  for (const issue of issues) {
    const target = "place" in issue ? issue.place.target : null;
    const key = target ?? "elsewhere";
    const group = groups.get(key) ?? {
      title:
        target === null
          ? "Not on a page"
          : target === "site"
            ? "Header, footer and menus"
            : pageTitle(target),
      page: target === null || target === "site" ? null : target,
      issues: [],
    };
    group.issues.push(issue);
    groups.set(key, group);
  }
  return Array.from(groups, ([key, group]) => ({ key, ...group }));
};

/**
 * The checks a draft must pass, beside the page: what's left to fix, grouped
 * by page, stepped through one at a time. The issue it's on is part of the
 * editor's address, so choosing one on another page opens that page with it.
 * Issues tick off as people fix them, and once none are left the draft can be
 * submitted.
 */
export function ChecksPanel(props: {
  readonly site: SiteId;
  readonly draft: { readonly id: DraftId; readonly name: string };
  /** The issue the panel is on, by its key, or "" before one is chosen. */
  readonly current: string;
  readonly onSubmit: () => void;
}) {
  const checks = useDraftChecks(props.site, props.draft.id);
  const view = useDraftView();
  const page = usePage();
  const showBlock = useShowBlock();
  const deselect = useDeselect();
  const issues = checks.data?.issues ?? [];
  const groups = groupsOf(issues, (id) => {
    const found = view.pages[id];
    return found === undefined ? "A page" : found.meta.title || found.path;
  });
  const ordered = groups.flatMap((group) => group.issues);
  const index = ordered.findIndex((issue) => issueKey(issue) === props.current);
  const current = ordered[index];
  const currentPlace = current === undefined ? null : fixPlaceOf(current, view);

  // Each issue chosen is shown once, when its page is the one being edited.
  const chosenKey = props.current;
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (shown.current === chosenKey) return;
    // A page's own settings show beside it when nothing on it is selected.
    if (currentPlace?.kind === "page" && currentPlace.page === page) {
      shown.current = chosenKey;
      deselect();
    }
    if (currentPlace?.kind !== "canvas") return;
    if (currentPlace.page !== null && currentPlace.page !== page) return;
    shown.current = chosenKey;
    showBlock(currentPlace.target, currentPlace.block, currentPlace.path ?? undefined);
  }, [currentPlace, chosenKey, page, showBlock, deselect]);

  /** Where choosing an issue goes: its page, or this one, with it chosen. */
  const linkTo = (issue: CheckIssue) => {
    const place = fixPlaceOf(issue, view);
    return {
      to: "/sites/$siteId/drafts/$draftId/pages/$pageId",
      params: {
        siteId: props.site,
        draftId: props.draft.id,
        pageId:
          (place?.kind === "canvas" || place?.kind === "page") && place.page !== null
            ? place.page
            : page,
      },
      search: { checks: issueKey(issue) },
    } as const;
  };
  // Before one is chosen, stepping starts at either end.
  const previous = index < 0 ? ordered.at(-1) : ordered[(index - 1 + ordered.length) % ordered.length];
  const next = index < 0 ? ordered[0] : ordered[(index + 1) % ordered.length];

  return (
    <section aria-labelledby="checks-heading" className="flex h-full flex-col">
      <header className="flex flex-col gap-3 border-b p-4">
        <div className="flex items-start gap-2">
          <div className="flex grow flex-col">
            <span className="text-xs text-muted-foreground">Checks on {props.draft.name}</span>
            <h2 id="checks-heading" className="text-lg font-semibold">
              {checks.data === undefined
                ? "Checking the draft"
                : issues.length === 0
                  ? "Ready to submit"
                  : issues.length === 1
                    ? "1 thing to fix"
                    : `${issues.length} things to fix`}
            </h2>
          </div>
          <Link
            to="/sites/$siteId/drafts/$draftId/pages/$pageId"
            params={{ siteId: props.site, draftId: props.draft.id, pageId: page }}
            search={{}}
            aria-label="Close checks"
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          >
            <XIcon />
          </Link>
        </div>
        {previous !== undefined && next !== undefined && (
          <nav aria-label="Step through the issues" className="flex items-center gap-2">
            <Link {...linkTo(previous)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ChevronLeftIcon />
              Previous
            </Link>
            <span className="grow text-center text-sm text-muted-foreground" aria-live="polite">
              {index < 0 ? `${issues.length} to go` : `${index + 1} of ${issues.length}`}
            </span>
            <Link {...linkTo(next)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Next
              <ChevronRightIcon />
            </Link>
          </nav>
        )}
        <p className="text-xs text-muted-foreground">Each one ticks off as soon as it's fixed.</p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        {checks.data !== undefined && issues.length === 0 && (
          <div className="flex flex-col items-start gap-3">
            <p className="flex items-center gap-2">
              <CircleCheckIcon className="size-4 text-success-foreground" aria-hidden />
              This draft passes its checks.
            </p>
            <Button onClick={props.onSubmit}>
              <SendIcon />
              Submit for approval
            </Button>
          </div>
        )}
        {groups.map((group) => (
          <section key={group.key} aria-label={group.title} className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <FileTextIcon className="size-4 text-muted-foreground" aria-hidden />
              {group.title}
              {group.page === page && <Badge variant="secondary">Open now</Badge>}
            </h3>
            <ul className="flex flex-col gap-2">
              {group.issues.map((issue) => {
                const key = issueKey(issue);
                const chosen = key === props.current;
                return (
                  <li
                    key={key}
                    className="flex flex-col gap-2 rounded-lg border p-3 data-[chosen=true]:border-primary data-[chosen=true]:bg-accent"
                    data-chosen={chosen}
                  >
                    <Link
                      {...linkTo(issue)}
                      aria-current={chosen ? "step" : undefined}
                      className="flex items-start gap-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <CircleAlertIcon
                        className="mt-0.5 size-4 shrink-0 text-warning-foreground"
                        aria-hidden
                      />
                      {describeIssue(issue).text}
                    </Link>
                    {chosen && <p className="text-sm text-muted-foreground">{hintFor(issue)}</p>}
                    {chosen && currentPlace?.kind === "pages" && (
                      <Link
                        to="/sites/$siteId/drafts/$draftId"
                        params={{ siteId: props.site, draftId: props.draft.id }}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        <FileTextIcon />
                        Open Pages and menus
                      </Link>
                    )}
                    {chosen && currentPlace?.kind === "forms" && (
                      <Link
                        to="/sites/$siteId/settings/forms"
                        params={{ siteId: props.site }}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        <SettingsIcon />
                        Open Forms and email
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
