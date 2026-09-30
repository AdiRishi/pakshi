import type { Home, Viewer } from "@repo/contracts/studio";
import { buttonVariants } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@repo/ui/components/item";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, GlobeIcon } from "lucide-react";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { waitingStep } from "@/features/approvals/describe";
import { homeQuery } from "@/features/approvals/queries";
import { previewPath } from "@/features/drafts/share-dialog";
import { formatMoment } from "@/lib/dates";

/** A card of items under a heading, shown only when it has some. */
function Listing(props: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={props.id}>
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>
            <h2 id={props.id} className="text-lg font-semibold">
              {props.title}
            </h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <ItemGroup className="gap-0 divide-y">{props.children}</ItemGroup>
        </CardContent>
      </Card>
    </section>
  );
}

function Waiting(props: { readonly items: Home["waiting"] }) {
  return (
    <Listing id="waiting" title="Waiting for your approval">
      {props.items.map(({ site, submission }) => (
        <Item key={submission.id} render={<li />} className="rounded-none px-6">
          <ItemContent>
            <ItemTitle>Approve "{submission.draft.name}"</ItemTitle>
            <ItemDescription>
              {site.name}, from {submission.submittedBy.name} {formatMoment(submission.submittedAt)}
              . {waitingStep(submission)}.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Link
              to="/approvals/$siteId/$submissionId"
              params={{ siteId: site.id, submissionId: submission.id }}
              className={buttonVariants({ variant: "outline", size: "sm" })}
              aria-label={`Review ${submission.draft.name}`}
            >
              Review
            </Link>
          </ItemActions>
        </Item>
      ))}
    </Listing>
  );
}

function Shared(props: { readonly drafts: Home["shared"] }) {
  return (
    <Listing id="shared" title="Shared with you">
      {props.drafts.map(({ site, draft, access }) => (
        <Item key={draft.id} render={<li />} className="rounded-none px-6">
          <ItemContent>
            <ItemTitle>{draft.name}</ItemTitle>
            <ItemDescription>
              {site.name}. {access === "edit" ? "Can edit" : "Can view"}.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            {access === "edit" ? (
              <Link
                to="/sites/$siteId/drafts/$draftId"
                params={{ siteId: site.id, draftId: draft.id }}
                className={buttonVariants({ variant: "outline", size: "sm" })}
                aria-label={`Open ${draft.name}`}
              >
                Open
              </Link>
            ) : (
              <a
                href={previewPath(site.id, draft.id)}
                className={buttonVariants({ variant: "outline", size: "sm" })}
                aria-label={`Preview ${draft.name}`}
              >
                Preview
              </a>
            )}
          </ItemActions>
        </Item>
      ))}
    </Listing>
  );
}

export function HomePage({ viewer }: { readonly viewer: Viewer }) {
  const { data: home } = useSuspenseQuery(homeQuery);
  return (
    <AppShell viewer={viewer}>
      <header className="flex flex-col gap-2 bg-accent px-10 pt-9 pb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          Hello, {viewer.user.name.split(" ")[0]}
        </h1>
        <p className="text-secondary-foreground">Your sites and what you can do on them.</p>
      </header>
      <div className="grid gap-8 px-10 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
        <section aria-labelledby="your-sites">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>
                <h2 id="your-sites" className="text-lg font-semibold">
                  Your sites
                </h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {viewer.sites.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <GlobeIcon />
                    </EmptyMedia>
                    <EmptyTitle>No sites yet</EmptyTitle>
                    <EmptyDescription>
                      You can't edit any sites yet. Ask your team's Pakshi admin for access.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ItemGroup className="gap-0 divide-y">
                  {viewer.sites.map((site) => (
                    <li key={site.id}>
                      <Item
                        render={<Link to="/sites/$siteId" params={{ siteId: site.id }} />}
                        className="rounded-none px-6 hover:bg-accent"
                      >
                        <ItemContent>
                          <ItemTitle>{site.name}</ItemTitle>
                          <ItemDescription>{site.brand}</ItemDescription>
                        </ItemContent>
                        <ChevronRightIcon className="text-muted-foreground" aria-hidden />
                      </Item>
                    </li>
                  ))}
                </ItemGroup>
              )}
            </CardContent>
          </Card>
        </section>
        <div className="flex flex-col gap-8">
          {home.waiting.length > 0 && <Waiting items={home.waiting} />}
          {home.shared.length > 0 && <Shared drafts={home.shared} />}
          <section aria-labelledby="your-access">
            <Card className="gap-0 py-0">
              <CardHeader className="border-b py-4">
                <CardTitle>
                  <h2 id="your-access" className="text-lg font-semibold">
                    Your access
                  </h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                {viewer.roles.length === 0 ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>No roles yet</EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <ItemGroup className="gap-0 divide-y">
                    {viewer.roles.map((role) => (
                      <Item
                        key={`${role.role}-${role.scope}`}
                        render={<li />}
                        className="rounded-none px-6"
                      >
                        <ItemContent>
                          <ItemTitle>{role.role}</ItemTitle>
                        </ItemContent>
                        <ItemContent className="flex-none">
                          <ItemDescription>{role.scope}</ItemDescription>
                        </ItemContent>
                      </Item>
                    ))}
                  </ItemGroup>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
