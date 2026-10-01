import type { SiteId } from "@repo/contracts/ids";
import type { SiteBlock, Viewer } from "@repo/contracts/studio";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { InfoIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { formatDay } from "@/lib/dates";

import { SiteHeader } from "../sites/site-header";
import { adoptUpgrade } from "./functions";
import { siteBlocksQuery } from "./queries";

/** Where a block is used on the site, in a few words. */
const usedOn = (block: SiteBlock) => {
  if (block.sitewide) return "Every page";
  if (block.pages === 0) return "Not used yet";
  return block.pages === 1 ? "1 page" : `${block.pages} pages`;
};

const behind = (block: SiteBlock) =>
  block.version < block.latest && block.pages + Number(block.sitewide) > 0;

/** Adopts a block's newest version in a new draft, or opens the draft already doing it. */
function Adopt(props: {
  readonly site: SiteId;
  readonly block: SiteBlock;
  readonly variant: "default" | "link";
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const adopt = useMutation({
    mutationFn: () => adoptUpgrade({ data: { site: props.site, type: props.block.type } }),
    onSuccess: async (draft) => {
      await queryClient.invalidateQueries({ queryKey: ["sites", props.site] });
      toast.success(`${draft.name} is ready`, {
        description: "Nothing changes on the live site until this draft publishes.",
      });
      await navigate({
        to: "/sites/$siteId/drafts/$draftId",
        params: { siteId: props.site, draftId: draft.id },
      });
    },
    onError: (error) => toast.error(error.message),
  });
  if (props.block.upgradeDraft !== null)
    return (
      <Link
        to="/sites/$siteId/drafts/$draftId"
        params={{ siteId: props.site, draftId: props.block.upgradeDraft.id }}
        className={buttonVariants({ variant: props.variant === "link" ? "link" : "outline" })}
      >
        Open draft
      </Link>
    );
  return (
    <Button
      variant={props.variant}
      disabled={adopt.isPending}
      aria-label={`Adopt ${props.block.title} v${props.block.latest}`}
      onClick={() => adopt.mutate()}
    >
      Adopt upgrade
    </Button>
  );
}

/**
 * Changes the platform team accepted to how this site's block versions look,
 * which reach the live site without a draft.
 */
function RenderingChanges(props: { readonly blocks: ReadonlyArray<SiteBlock> }) {
  const changes = Map.groupBy(
    props.blocks.flatMap((block) =>
      block.renderingChanges.map((entry) => ({ ...entry, title: block.title })),
    ),
    (entry) => `${entry.date} ${entry.change}`,
  );
  if (changes.size === 0) return null;
  return (
    <Alert>
      <InfoIcon />
      <AlertTitle>
        <h2>Changes to how your blocks look</h2>
      </AlertTitle>
      <AlertDescription>
        <ul className="flex flex-col gap-2">
          {Array.from(changes.values(), (entries) => {
            const [first] = entries;
            if (first === undefined) return null;
            return (
              <li key={`${first.date} ${first.change}`}>
                <strong>
                  {formatDay(first.date)}, {entries.map((entry) => entry.title).join(", ")}:
                </strong>{" "}
                {first.change}
              </li>
            );
          })}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/** The blocks a site uses, the version of each, and the upgrades it can adopt. */
export function SiteBlocksPage(props: { readonly viewer: Viewer; readonly site: SiteId }) {
  const { data } = useSuspenseQuery(siteBlocksQuery(props.site));
  const upgrades = data.blocks.filter(behind);
  return (
    <AppShell viewer={props.viewer}>
      <SiteHeader
        site={data.site}
        section="blocks"
        description="This site stays on these block versions until an upgrade draft publishes."
      />
      <div className="flex flex-col gap-6 px-10 py-8">
        {upgrades.map((block) => (
          <Alert key={block.type}>
            <SparklesIcon />
            <AlertTitle>
              <h2>
                {block.title} v{block.latest} is available
              </h2>
            </AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              {block.newer.map((version) => (
                <p key={version.version}>
                  <strong>v{version.version}:</strong> {version.changes}
                </p>
              ))}
              <p>
                Adopting it creates a draft with your {block.title} blocks on v{block.latest},
                converting their content where the new version needs it. It goes through the site's
                approval workflow, and nothing changes on the live site until it publishes.
              </p>
            </AlertDescription>
            {data.can.upgrade && (
              <AlertAction>
                <Adopt site={data.site.id} block={block} variant="default" />
              </AlertAction>
            )}
          </Alert>
        ))}
        <RenderingChanges blocks={data.blocks} />
        <Card className="gap-0 py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-6">Block</TableHead>
                  <TableHead>Version in use</TableHead>
                  <TableHead>Used on</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-0 px-6">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.blocks.map((block) => (
                  <TableRow key={block.type}>
                    <TableCell className="px-6 font-medium">{block.title}</TableCell>
                    <TableCell>
                      v{block.version}
                      {block.version < block.latest && (
                        <span className="block text-xs text-muted-foreground">
                          Latest is v{block.latest}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{usedOn(block)}</TableCell>
                    <TableCell>
                      {block.upgradeDraft !== null ? (
                        <Badge variant="secondary">Upgrade draft open</Badge>
                      ) : block.version < block.latest ? (
                        <Badge variant="warning">Upgrade available</Badge>
                      ) : (
                        <Badge variant="secondary">Up to date</Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-6">
                      {data.can.upgrade && block.version < block.latest && (
                        <Adopt site={data.site.id} block={block} variant="link" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
