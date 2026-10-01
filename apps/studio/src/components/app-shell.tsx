import type { Viewer } from "@repo/contracts/studio";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@repo/ui/components/sidebar";
import { Link, useMatchRoute } from "@tanstack/react-router";
import {
  BlocksIcon,
  CircleCheckIcon,
  HistoryIcon,
  HouseIcon,
  LogOutIcon,
  PaletteIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";
import { type ReactNode, useId } from "react";

import { Logo } from "@/components/logo";
import { initials } from "@/lib/initials";

/** Studio's frame for a signed-in person: the navigation sidebar and the page beside it. */
export function AppShell(props: { readonly viewer: Viewer; readonly children: ReactNode }) {
  const [primaryRole] = props.viewer.roles;
  const { can } = props.viewer;
  const matchRoute = useMatchRoute();
  const organizationLabel = useId();
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
                <SidebarMenuItem>
                  <SidebarMenuButton
                    size="lg"
                    isActive={matchRoute({ to: "/blocks", fuzzy: true }) !== false}
                    render={<Link to="/blocks" />}
                  >
                    <BlocksIcon />
                    Blocks
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {props.viewer.brands && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      size="lg"
                      isActive={matchRoute({ to: "/brands", fuzzy: true }) !== false}
                      render={<Link to="/brands" />}
                    >
                      <PaletteIcon />
                      Brands
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </nav>
          </SidebarGroup>
          {(can.invite || can.manageRoles || can.readAudit) && (
            <SidebarGroup>
              <SidebarGroupLabel id={organizationLabel}>Organization</SidebarGroupLabel>
              <nav aria-labelledby={organizationLabel}>
                <SidebarMenu>
                  {can.invite && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        size="lg"
                        isActive={matchRoute({ to: "/people", fuzzy: true }) !== false}
                        render={<Link to="/people" />}
                      >
                        <UsersIcon />
                        People
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      size="lg"
                      isActive={matchRoute({ to: "/roles", fuzzy: true }) !== false}
                      render={<Link to="/roles" />}
                    >
                      <ShieldCheckIcon />
                      Roles
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {can.readAudit && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        size="lg"
                        isActive={matchRoute({ to: "/audit", fuzzy: true }) !== false}
                        render={<Link to="/audit" />}
                      >
                        <HistoryIcon />
                        Audit log
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </nav>
            </SidebarGroup>
          )}
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
