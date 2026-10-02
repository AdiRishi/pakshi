import type { Release } from "@repo/contracts/release";
import { newEntriesDays, type SiteOverview } from "@repo/contracts/studio";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/components/tooltip";
import { useMutation } from "@tanstack/react-query";
import { Link, type LinkProps } from "@tanstack/react-router";
import { cn } from "cn";
import {
  ArrowUpRightIcon,
  CheckIcon,
  CopyIcon,
  FilePenLineIcon,
  InboxIcon,
  type LucideIcon,
  SparklesIcon,
} from "lucide-react";

import { formatAgo, formatDay } from "@/lib/dates";

import { LiveThumbnail } from "./live-thumbnail";

/** An address as people say it: its host, without the protocol. */
const hostOf = (address: string) => new URL(address).host;

/** When and how the live release went live, such as "Published 2 hours ago by Meera Kapoor". */
const wentLive = (release: Exclude<Release, { readonly _tag: "Created" }>) => {
  switch (release._tag) {
    case "Published":
      return `Published ${formatAgo(release.at)} by ${release.by.name}`;
    case "RolledBack":
      return `Rolled back ${formatAgo(release.at)} by ${release.by.name}`;
    case "Imported":
      return `Live since ${formatDay(release.at)}`;
  }
};

function CopyAddress(props: { readonly address: string }) {
  const copy = useMutation({ mutationFn: () => navigator.clipboard.writeText(props.address) });
  const label = copy.isSuccess ? "Address copied" : "Copy address";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={label} onClick={() => copy.mutate()} />
        }
      >
        {copy.isSuccess ? <CheckIcon /> : <CopyIcon />}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * One of the counts under the address, such as "2 open drafts", linking to
 * the tab it counts in. A count of none says so in words.
 */
function Count(props: {
  readonly icon: LucideIcon;
  readonly count: number;
  /** What follows the number: "open draft" or "open drafts". */
  readonly counted: readonly [one: string, many: string];
  readonly none: string;
  readonly link: LinkProps;
}) {
  return (
    <li>
      <Link
        {...props.link}
        className={cn(
          "inline-flex items-center gap-2 rounded-sm text-sm underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          props.count === 0 ? "text-muted-foreground" : "text-foreground",
        )}
      >
        <props.icon aria-hidden className="size-4 text-muted-foreground" />
        {props.count === 0 ? (
          props.none
        ) : (
          <span>
            <strong className="font-semibold">{props.count}</strong>{" "}
            {props.count === 1 ? props.counted[0] : props.counted[1]}
          </span>
        )}
      </Link>
    </li>
  );
}

function Counts(props: { readonly overview: SiteOverview }) {
  const { site, editing, newEntries } = props.overview;
  if (editing === null && newEntries === null) return null;
  const params = { siteId: site.id };
  const updates =
    editing === null ? 0 : editing.blockUpdates + (editing.brandUpdate === null ? 0 : 1);
  return (
    <ul aria-label="What's waiting" className="flex flex-wrap gap-x-8 gap-y-2">
      {editing !== null &&
        (editing.waitingDrafts > 0 ? (
          <Count
            icon={FilePenLineIcon}
            count={editing.waitingDrafts}
            counted={["draft waiting for approval", "drafts waiting for approval"]}
            none="No open drafts"
            link={{ to: "/sites/$siteId", params }}
          />
        ) : (
          <Count
            icon={FilePenLineIcon}
            count={editing.openDrafts}
            counted={["open draft", "open drafts"]}
            none="No open drafts"
            link={{ to: "/sites/$siteId", params }}
          />
        ))}
      {newEntries !== null && (
        <Count
          icon={InboxIcon}
          count={newEntries}
          counted={[
            `new submission in the last ${newEntriesDays} days`,
            `new submissions in the last ${newEntriesDays} days`,
          ]}
          none={`No new submissions in the last ${newEntriesDays} days`}
          link={{ to: "/sites/$siteId/submissions", params }}
        />
      )}
      {editing !== null && (
        <Count
          icon={SparklesIcon}
          count={updates}
          counted={["update available", "updates available"]}
          none="No updates available"
          link={
            editing.blockUpdates === 0 && editing.brandUpdate !== null
              ? {
                  to: "/sites/$siteId/drafts/$draftId",
                  params: { siteId: site.id, draftId: editing.brandUpdate.id },
                }
              : { to: "/sites/$siteId/blocks", params }
          }
        />
      )}
    </ul>
  );
}

/**
 * Where the site is and whether it's live: its address with a way to open
 * and copy it, when it last went live, a picture of its live home page, and
 * what waits in the tabs below.
 */
export function SiteOverviewPanel(props: { readonly overview: SiteOverview }) {
  const { overview } = props;
  const { own, pakshi } = overview.addresses;
  const address = own ?? pakshi;
  const live = overview.live;
  return (
    <div className="@container flex items-start gap-10">
      <div className="flex min-w-0 grow flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{overview.site.name}</h1>
          {live._tag === "Created" ? (
            <p className="flex flex-wrap items-center gap-2 text-secondary-foreground">
              <Badge variant="secondary">Not published yet</Badge>
              <span>
                {address === null
                  ? "Visitors can see the site once its first draft is published."
                  : `Visitors will find it at ${hostOf(address)} once its first draft is published.`}
              </span>
            </p>
          ) : (
            <p className="flex flex-wrap items-center gap-2 text-secondary-foreground">
              <Badge variant="success">Live</Badge>
              {overview.editing === null ? (
                <span>{wentLive(live)}</span>
              ) : (
                <Link
                  to="/sites/$siteId/releases"
                  params={{ siteId: overview.site.id }}
                  className="underline-offset-4 hover:underline"
                >
                  {wentLive(live)}
                </Link>
              )}
            </p>
          )}
        </div>
        {live._tag !== "Created" && address !== null && (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <a
                href={address}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                Visit site
                <ArrowUpRightIcon aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate font-medium">{hostOf(address)}</span>
                <CopyAddress address={address} />
              </span>
            </div>
            {own !== null && pakshi !== null && (
              <p className="text-sm text-muted-foreground">Also at {hostOf(pakshi)}</p>
            )}
          </div>
        )}
        <Counts overview={overview} />
      </div>
      {live._tag !== "Created" && overview.home !== null && (
        <LiveThumbnail
          site={overview.site.id}
          home={overview.home}
          address={address}
          className="hidden w-72 shrink-0 @3xl:block"
        />
      )}
    </div>
  );
}
