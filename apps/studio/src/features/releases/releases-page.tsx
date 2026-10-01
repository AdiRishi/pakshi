import type { SiteId } from "@repo/contracts/ids";
import type { Release } from "@repo/contracts/release";
import type { Viewer } from "@repo/contracts/studio";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
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
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { formatDay, formatTime } from "@/lib/dates";

import { DraftNameDialog } from "../drafts/draft-name-dialog";
import { restoreRelease, rollBack } from "../sites/functions";
import { siteDraftsQuery, siteReleasesQuery } from "../sites/queries";
import { SiteHeader } from "../sites/site-header";
import { releaseNamed, releaseTitle } from "./describe";

/** Who made a release: who submitted and approved a publish, or who rolled back. */
const whoBy = (release: Release): string => {
  switch (release._tag) {
    case "Imported":
      return "Pakshi";
    case "Created":
    case "RolledBack":
      return release.by.name;
    case "Published":
      return release.approvedBy.length === 0
        ? release.submittedBy.name
        : `${release.submittedBy.name}, approved by ${release.approvedBy.map((person) => person.name).join(" and ")}`;
  }
};

/** The release before the latest, which rolling back makes live again, when the latest is a publish. */
const rollBackTarget = (releases: ReadonlyArray<Release>) => {
  const [latest, before] = releases;
  return latest?._tag === "Published" && before !== undefined ? { latest, before } : null;
};

/** Every publish and rollback of a site, newest first, with rolling back and restoring. */
export function ReleasesPage(props: { readonly viewer: Viewer; readonly site: SiteId }) {
  const { data } = useSuspenseQuery(siteReleasesQuery(props.site));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState<Release | null>(null);
  const target = data.can.rollBack ? rollBackTarget(data.releases) : null;
  const rolledBack = new Set(
    data.releases.flatMap((release) => (release._tag === "RolledBack" ? [release.undid] : [])),
  );

  const roll = useMutation({
    mutationFn: () => rollBack({ data: { site: props.site } }),
    onSuccess: async () => {
      toast.success("Rolled back", {
        description: "The earlier release is live again within about a minute.",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: siteReleasesQuery(props.site).queryKey }),
        queryClient.invalidateQueries({ queryKey: siteDraftsQuery(props.site).queryKey }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AppShell viewer={props.viewer}>
      <SiteHeader
        site={data.site}
        section="releases"
        description="Every publish is kept here. Roll back undoes the latest publish, and the release before it is live again within about a minute. To bring back an older release, restore it as a draft."
      />
      <div className="px-10 py-8">
        <Card className="gap-0 py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-6">Went live</TableHead>
                  <TableHead>What changed</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead className="w-0 px-6">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.releases.map((release, index) => (
                  <TableRow key={release.id}>
                    <TableCell className="px-6">
                      <div className="flex flex-col">
                        <span className="font-medium">{formatDay(release.at)}</span>
                        <span className="text-sm text-muted-foreground">
                          {formatTime(release.at)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{releaseTitle(release)}</span>
                        {index === 0 && <Badge variant="success">Live now</Badge>}
                        {rolledBack.has(release.id) && (
                          <Badge variant="secondary">Rolled back</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{whoBy(release)}</TableCell>
                    <TableCell className="px-6">
                      <div className="flex justify-end">
                        {index === 0 && target !== null ? (
                          <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
                            Roll back
                          </Button>
                        ) : index > 0 && release._tag !== "RolledBack" ? (
                          <Button variant="outline" size="sm" onClick={() => setRestoring(release)}>
                            Restore as draft
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      {target !== null && (
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Roll back the latest publish?</AlertDialogTitle>
              <AlertDialogDescription>
                {releaseNamed(target.latest)} comes off the live site, and{" "}
                {releaseNamed(target.before)} is live again within about a minute.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
              <li>No approval is needed: that release was already live.</li>
              <li>
                Open drafts aren't changed, but they'll need updating before they're published.
              </li>
              <li>The rolled-back release stays in this list, and can be restored as a draft.</li>
            </ul>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={roll.isPending} onClick={() => roll.mutate()}>
                Roll back
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {restoring !== null && (
        <DraftNameDialog
          open
          onOpenChange={(isOpen) => {
            if (!isOpen) setRestoring(null);
          }}
          heading="Restore as a draft"
          description={`The draft holds the site as it was in ${releaseNamed(restoring)}. It goes live only when it's published, like any other change.`}
          submitLabel="Restore"
          initial={`Restore: ${releaseTitle(restoring)}`.slice(0, 80)}
          onSubmit={async (name) => {
            const draft = await restoreRelease({
              data: { site: props.site, release: restoring.id, name },
            });
            await queryClient.invalidateQueries({ queryKey: siteDraftsQuery(props.site).queryKey });
            await navigate({
              to: "/sites/$siteId/drafts/$draftId",
              params: { siteId: props.site, draftId: draft.id },
            });
          }}
        />
      )}
    </AppShell>
  );
}
