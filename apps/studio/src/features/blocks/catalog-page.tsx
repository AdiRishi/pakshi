import type { BlockType } from "@repo/contracts/ids";
import type { CatalogBlock, RemovableVersion, UpgradeResult, Viewer } from "@repo/contracts/studio";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { formatDay } from "@/lib/dates";

import { BlockRequestList, RequestBlockDialog } from "./block-requests";
import { upgradeEverywhere } from "./functions";
import { blockCatalogQuery, blockRequestsQuery } from "./queries";

const placementTitles = {
  section: "Section",
  item: "Item in a section",
  header: "Header",
  footer: "Footer",
} as const satisfies Record<CatalogBlock["placement"], string>;

const sitesOn = (count: number) => (count === 1 ? "1 site" : `${count} sites`);

/** How many sites have an older version than the newest live. */
const behindCount = (block: CatalogBlock) =>
  block.versions
    .filter((version) => version.version < block.latest)
    .reduce((sum, version) => sum + version.sites, 0);

function UpgradeEverywhere(props: { readonly block: CatalogBlock }) {
  const queryClient = useQueryClient();
  const upgrade = useMutation({
    mutationFn: () => upgradeEverywhere({ data: { type: props.block.type } }),
    onSuccess: async (results: ReadonlyArray<UpgradeResult>) => {
      await queryClient.invalidateQueries({ queryKey: ["blocks"] });
      const failed = results.filter((result) => result.failed);
      const made = results.filter((result) => result.draft !== null);
      if (failed.length > 0)
        toast.error(`${sitesOn(failed.length)} couldn't be reached`, {
          description: "Try again to create the drafts still missing.",
        });
      else
        toast.success(`Upgrade drafts on ${sitesOn(made.length)}`, {
          description: "Each follows its site's approval workflow.",
        });
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Button variant="outline" disabled={upgrade.isPending} onClick={() => upgrade.mutate()}>
      Create upgrade drafts on {sitesOn(behindCount(props.block))}
    </Button>
  );
}

function BlockCard(props: { readonly block: CatalogBlock; readonly canUpgrade: boolean }) {
  const { block } = props;
  const behind = behindCount(block);
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2">
            {block.title}
            <Badge variant="secondary">v{block.latest}</Badge>
          </h2>
        </CardTitle>
        <CardDescription>{block.purpose}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">{placementTitles[block.placement]}</p>
        <ol className="flex flex-col gap-2">
          {block.versions.map((version) => (
            <li key={version.version} className="flex flex-col gap-0.5">
              <span className="font-medium">
                v{version.version}
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · live on {sitesOn(version.sites)}
                </span>
              </span>
              {version.changes !== null && (
                <span className="text-muted-foreground">{version.changes}</span>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
      {props.canUpgrade && behind > 0 && (
        <CardFooter>
          <UpgradeEverywhere block={block} />
        </CardFooter>
      )}
    </Card>
  );
}

/** Every block in the library, its versions, and where each is live. */
export function CatalogPage(props: { readonly viewer: Viewer }) {
  const { data } = useSuspenseQuery(blockCatalogQuery);
  const { data: requests } = useSuspenseQuery(blockRequestsQuery);
  const [requesting, setRequesting] = useState(false);
  const searchId = useId();
  const [search, setSearch] = useState("");
  const shown = data.blocks.filter((block) =>
    `${block.title} ${block.purpose}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <AppShell viewer={props.viewer}>
      <header className="flex flex-col gap-2 bg-accent px-10 pt-6 pb-8">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">Blocks</h1>
          {requests.sites.length > 0 && (
            <Button className="ml-auto" variant="outline" onClick={() => setRequesting(true)}>
              <PlusIcon />
              Request a new block
            </Button>
          )}
        </div>
        <p className="text-secondary-foreground">
          The sections every page is built from. Sites keep their version of each block until
          someone adopts an upgrade, which goes through the site's approval workflow.
        </p>
      </header>
      <div className="flex flex-col gap-6 px-10 py-8">
        <div className="flex max-w-sm flex-col gap-2">
          <Label htmlFor={searchId}>Search blocks</Label>
          <Input
            id={searchId}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {shown.length === 1 ? "1 block" : `${shown.length} blocks`}
        </p>
        <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((block) => (
            <li key={block.type}>
              <BlockCard block={block} canUpgrade={data.can.upgradeEverywhere} />
            </li>
          ))}
        </ul>
        <BlockRequestList data={requests} />
        {data.removable !== null && <Removable versions={data.removable} titles={data.blocks} />}
      </div>
      <RequestBlockDialog open={requesting} onOpenChange={setRequesting} sites={requests.sites} />
    </AppShell>
  );
}

/** For the platform team: versions nothing has used for 3 months, which can leave the registry. */
function Removable(props: {
  readonly versions: ReadonlyArray<RemovableVersion>;
  readonly titles: ReadonlyArray<CatalogBlock>;
}) {
  const title = (type: BlockType) =>
    props.titles.find((block) => block.type === type)?.title ?? type;
  return (
    <section aria-labelledby="removable" className="flex flex-col gap-3">
      <h2 id="removable" className="text-lg font-semibold">
        Versions that can be removed
      </h2>
      <p className="text-sm text-muted-foreground">
        No live site or open draft has used these for 3 months, and none is a block's newest
        version. Removing one from the repository means releases that pin it can't be rolled back to
        or restored.
      </p>
      {props.versions.length === 0 ? (
        <p className="text-sm">Every older version is still in use or was used recently.</p>
      ) : (
        <Card className="gap-0 py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-6">Block</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Last used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.versions.map((version) => (
                  <TableRow key={`${version.type}@${version.version}`}>
                    <TableCell className="px-6">{title(version.type)}</TableCell>
                    <TableCell>v{version.version}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {version.lastUsedAt === null ? "Never" : formatDay(version.lastUsedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
