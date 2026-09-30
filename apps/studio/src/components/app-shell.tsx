import type { Viewer } from "@repo/contracts/studio";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@repo/ui/components/sidebar";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { CircleCheckIcon, HouseIcon, LogOutIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Logo } from "@/components/logo";
import { initials } from "@/lib/initials";

/** Studio's frame for a signed-in person: the navigation sidebar and the page beside it. */
export function AppShell(props: { readonly viewer: Viewer; readonly children: ReactNode }) {
  const [primaryRole] = props.viewer.roles;
  const matchRoute = useMatchRoute();
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
                  <SidebarMenuButton
                    size="lg"
                    isActive={matchRoute({ to: "/" }) !== false}
                    render={<Link to="/" />}
                  >
                    <HouseIcon />
                    Home
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    size="lg"
                    isActive={matchRoute({ to: "/approvals", fuzzy: true }) !== false}
                    render={<Link to="/approvals" />}
                  >
                    <CircleCheckIcon />
                    Approvals
                  </SidebarMenuButton>
                  {props.viewer.approvalsWaiting > 0 && (
                    <SidebarMenuBadge>
                      {props.viewer.approvalsWaiting}
                      <span className="sr-only"> waiting for you</span>
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              </SidebarMenu>
            </nav>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-3 p-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-9">
              <AvatarFallback className="bg-foreground text-background">
                {initials(props.viewer.user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-foreground">
                {props.viewer.user.name}
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
      <SidebarInset>{props.children}</SidebarInset>
    </SidebarProvider>
  );
}
