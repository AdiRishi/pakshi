import { presentationOf } from "@repo/blocks";
import type { BlockType } from "@repo/contracts/ids";
import type { BlockUpdates as Updates, UpgradeResult } from "@repo/contracts/studio";
import { Button } from "@repo/ui/components/button";
import { Card } from "@repo/ui/components/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@repo/ui/components/item";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { toast } from "sonner";

import { formatDay } from "@/lib/dates";

import { upgradeEverywhere } from "./functions";
import { blockUpdatesQuery } from "./queries";

const sitesOf = (count: number) => (count === 1 ? "1 site" : `${count} sites`);

/** Makes an upgrade draft on every site that shows an older version of a block. */
function UpdateEverywhere(props: { readonly type: BlockType; readonly sites: number }) {
  const queryClient = useQueryClient();
  const upgrade = useMutation({
    mutationFn: () => upgradeEverywhere({ data: { type: props.type } }),
    onSuccess: async (results: ReadonlyArray<UpgradeResult>) => {
      await queryClient.invalidateQueries({ queryKey: ["blocks"] });
      const failed = results.filter((result) => result.failed);
      const made = results.filter((result) => result.draft !== null);
      if (failed.length > 0)
        toast.error(`${sitesOf(failed.length)} couldn't be reached`, {
          description: "Try again to make the drafts still missing.",
        });
      else
        toast.success(`Update drafts made on ${sitesOf(made.length)}`, {
          description: "Each goes through its site's usual approvals.",
        });
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={upgrade.isPending}
      onClick={() => upgrade.mutate()}
    >
      Update it on {sitesOf(props.sites)}
    </Button>
  );
}

function Behind(props: { readonly behind: Updates["behind"] }) {
  if (props.behind.length === 0)
    return (
      <p className="py-9 text-lg font-semibold">Every site uses the newest design of every block</p>
    );
  const named = props.behind
    .map((block) => ({ ...block, name: presentationOf(block.type).name }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="flex flex-col gap-3.5">
      <Card className="gap-0 py-0">
        {named.map((block) => (
          <Item key={block.type} className="rounded-none border-0 not-last:border-b">
            <ItemContent>
              <ItemTitle>{block.name}</ItemTitle>
              <ItemDescription>
                {block.sites === 1
                  ? "1 site uses an older design"
                  : `${block.sites} sites use an older design`}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <UpdateEverywhere type={block.type} sites={block.sites} />
            </ItemActions>
          </Item>
        ))}
      </Card>
      <p className="text-sm text-muted-foreground">
        Each update arrives as a draft on that site, so the site's usual approvals still apply.
      </p>
    </div>
  );
}

/** Versions nothing has used for 3 months, which can leave the registry. */
function Removable(props: { readonly versions: Updates["removable"] }) {
  return (
    <section aria-labelledby="removable" className="flex flex-col gap-3">
      <h2 id="removable" className="text-lg font-semibold">
        Versions that can be removed
      </h2>
      <p className="text-sm text-muted-foreground">
        No live site or open draft has used these for 3 months, and none is a block's newest
        version. Removing one from the code means releases that use it can't be rolled back to or
        restored.
      </p>
      {props.versions.length === 0 ? (
        <p className="text-sm">Every older version is still in use or was used recently.</p>
      ) : (
        <Card className="gap-0 py-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="px-4">Block</TableHead>
                <TableHead className="px-4">Version</TableHead>
                <TableHead className="px-4">Last used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.versions.map((version) => (
                <TableRow key={`${version.type}@${version.version}`}>
                  <TableCell className="px-4">{presentationOf(version.type).name}</TableCell>
                  <TableCell className="px-4">{version.version}</TableCell>
                  <TableCell className="px-4 text-muted-foreground">
                    {version.lastUsedAt === null ? "Never" : formatDay(version.lastUsedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </section>
  );
}

function Loaded() {
  const { data } = useSuspenseQuery(blockUpdatesQuery);
  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <Behind behind={data.behind} />
      <Removable versions={data.removable} />
    </div>
  );
}

/** For the platform team: the blocks sites show at an older version, and versions that can go. */
export function BlockUpdates() {
  return (
    <Suspense
      fallback={
        <div className="flex max-w-3xl flex-col gap-3">
          <Skeleton className="h-18" />
          <Skeleton className="h-18" />
        </div>
      }
    >
      <Loaded />
    </Suspense>
  );
}
