import type { SiteId } from "@repo/contracts/ids";
import type { Viewer } from "@repo/contracts/studio";
import { buttonVariants } from "@repo/ui/components/button";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";

import { SiteHeader } from "../sites/site-header";

const pages = [
  { key: "general", label: "General", to: "/sites/$siteId/settings" },
  { key: "domains", label: "Domains", to: "/sites/$siteId/settings/domains" },
  { key: "forms", label: "Forms and email", to: "/sites/$siteId/settings/forms" },
  { key: "workflow", label: "Approval workflow", to: "/sites/$siteId/settings/workflow" },
  { key: "members", label: "Members", to: "/sites/$siteId/settings/members" },
] as const;

/** One of a site's settings pages, with links to the others. */
export function SettingsShell(props: {
  readonly viewer: Viewer;
  readonly site: { readonly id: SiteId; readonly name: string };
  readonly page: (typeof pages)[number]["key"];
  readonly title: string;
  readonly description: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <AppShell viewer={props.viewer}>
      <SiteHeader
        site={props.site}
        section="settings"
        description="How the site runs, apart from what's in its drafts."
      />
      <div className="grid gap-8 px-10 py-8 lg:grid-cols-[12rem_1fr]">
        <nav aria-label="Settings" className="flex flex-col gap-1">
          {pages.map((page) => (
            <Link
              key={page.key}
              to={page.to}
              params={{ siteId: props.site.id }}
              // Link marks every link to a page above this one current too.
              activeOptions={{ exact: true }}
              aria-current={page.key === props.page ? "page" : undefined}
              className={buttonVariants({
                variant: "ghost",
                className:
                  "justify-start aria-[current=page]:bg-accent aria-[current=page]:font-semibold",
              })}
            >
              {page.label}
            </Link>
          ))}
        </nav>
        <section className="flex max-w-3xl flex-col gap-6">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex grow flex-col gap-1">
              <h2 className="text-2xl font-semibold tracking-tight">{props.title}</h2>
              <p className="text-sm text-muted-foreground">{props.description}</p>
            </div>
            {props.actions}
          </div>
          {props.children}
        </section>
      </div>
    </AppShell>
  );
}
