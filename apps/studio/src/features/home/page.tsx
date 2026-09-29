import type { Viewer } from "@repo/contracts/studio";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@repo/ui/components/item";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, GlobeIcon } from "lucide-react";

import { AppShell } from "@/components/app-shell";

export function HomePage({ viewer }: { readonly viewer: Viewer }) {
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
    </AppShell>
  );
}
