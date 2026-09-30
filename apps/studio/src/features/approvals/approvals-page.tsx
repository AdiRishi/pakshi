import type { SubmissionItem, Viewer } from "@repo/contracts/studio";
import { Badge } from "@repo/ui/components/badge";
import { buttonVariants } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleCheckIcon } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { formatMoment } from "@/lib/dates";

import { standing, waitingStep } from "./describe";
import { approvalsQuery } from "./queries";

const tabs = [
  {
    key: "waiting",
    label: "Waiting for me",
    empty: "Nothing waits for your decision. Submissions you can approve appear here.",
  },
  { key: "sent", label: "Sent by me", empty: "None of your submissions are in review." },
  { key: "finished", label: "Finished", empty: "Nothing you sent or decided on has finished yet." },
] as const;

function Submissions(props: {
  readonly items: ReadonlyArray<SubmissionItem>;
  readonly action: "Review" | "View";
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="px-6">Draft</TableHead>
          <TableHead>Site</TableHead>
          <TableHead>Sent by</TableHead>
          <TableHead>Where it stands</TableHead>
          <TableHead className="w-0 px-6">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.items.map(({ site, submission }) => {
          const status = standing(submission);
          return (
            <TableRow key={submission.id}>
              <TableCell className="px-6 font-medium">{submission.draft.name}</TableCell>
              <TableCell>{site.name}</TableCell>
              <TableCell>
                <span className="flex flex-col">
                  <span>{submission.submittedBy.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatMoment(submission.submittedAt)}
                  </span>
                </span>
              </TableCell>
              <TableCell>
                <span className="flex flex-col items-start gap-1">
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {submission.status._tag === "InReview" && (
                    <span className="text-xs text-muted-foreground">{waitingStep(submission)}</span>
                  )}
                </span>
              </TableCell>
              <TableCell className="px-6">
                <Link
                  to="/approvals/$siteId/$submissionId"
                  params={{ siteId: site.id, submissionId: submission.id }}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  aria-label={`${props.action} ${submission.draft.name}`}
                >
                  {props.action}
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Everything waiting for the person's decision, what they sent, and what's finished. */
export function ApprovalsPage(props: { readonly viewer: Viewer }) {
  const { data } = useSuspenseQuery(approvalsQuery);
  return (
    <AppShell viewer={props.viewer}>
      <header className="flex flex-col gap-2 bg-accent px-10 pt-9 pb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Approvals</h1>
        <p className="text-secondary-foreground">
          Changes waiting for your decision. You see exactly what will be published, and nothing
          goes live until the last step approves.
        </p>
      </header>
      <div className="px-10 py-8">
        <Tabs defaultValue="waiting">
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {tab.label} ({data[tab.key].length})
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent key={tab.key} value={tab.key}>
              <Card className="mt-4 gap-0 py-0">
                <CardContent className="px-0">
                  {data[tab.key].length === 0 ? (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <CircleCheckIcon />
                        </EmptyMedia>
                        <EmptyTitle>Nothing here</EmptyTitle>
                        <EmptyDescription>{tab.empty}</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <Submissions
                      items={data[tab.key]}
                      action={tab.key === "waiting" ? "Review" : "View"}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppShell>
  );
}
