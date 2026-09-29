import type { Viewer } from "@repo/contracts/studio";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@repo/ui/components/item";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@repo/ui/components/sidebar";
import { Link } from "@tanstack/react-router";
import { GlobeIcon, HouseIcon, LogOutIcon } from "lucide-react";

import { Logo } from "@/components/logo";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

export function HomePage({ viewer }: { readonly viewer: Viewer }) {
  const [primaryRole] = viewer.roles;
  return (
    <SidebarProvider>
      <Sidebar collapsible="none" className="h-auto min-h-screen border-r">
        <SidebarHeader className="px-4 py-5">
          <Logo />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <nav aria-label="Studio">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton size="lg" isActive render={<Link to="/" />}>
                    <HouseIcon />
                    Home
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </nav>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-3 p-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-9">
              <AvatarFallback className="bg-foreground text-background">
                {initials(viewer.user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-foreground">
                {viewer.user.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {primaryRole === undefined
                  ? "No access yet"
                  : `${primaryRole.role}, ${primaryRole.scope}`}
              </span>
            </div>
          </div>
          <form method="post" action="/sign-out" className="flex flex-col">
            <Button type="submit" variant="outline">
              <LogOutIcon />
              Sign out
            </Button>
          </form>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
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
                      <Item key={site.id} render={<li />} className="rounded-none px-6">
                        <ItemContent>
                          <ItemTitle>{site.name}</ItemTitle>
                          <ItemDescription>{site.brand}</ItemDescription>
                        </ItemContent>
                      </Item>
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
      </SidebarInset>
    </SidebarProvider>
  );
}
