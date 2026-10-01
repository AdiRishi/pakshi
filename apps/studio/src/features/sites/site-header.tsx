import type { SiteId } from "@repo/contracts/ids";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/components/breadcrumb";
import { buttonVariants } from "@repo/ui/components/button";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** A site's name, what it's showing, and links to the site's sections. */
export function SiteHeader(props: {
  readonly site: { readonly id: SiteId; readonly name: string };
  readonly section: "drafts" | "releases" | "blocks" | "settings";
  readonly description: string;
  readonly actions?: ReactNode;
}) {
  const sections = [
    { key: "drafts", label: "Drafts", to: "/sites/$siteId" },
    { key: "releases", label: "Releases", to: "/sites/$siteId/releases" },
    { key: "blocks", label: "Blocks", to: "/sites/$siteId/blocks" },
    { key: "settings", label: "Settings", to: "/sites/$siteId/settings" },
  ] as const;
  return (
    <header className="flex flex-col gap-3 bg-accent px-10 pt-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/" />}>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{props.site.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{props.site.name}</h1>
        <div className="ml-auto flex items-center gap-2">{props.actions}</div>
      </div>
      <p className="text-secondary-foreground">{props.description}</p>
      <nav aria-label="Site sections" className="flex gap-1">
        {sections.map((section) => (
          <Link
            key={section.key}
            to={section.to}
            params={{ siteId: props.site.id }}
            // Link marks every link to a page above this one current too.
            activeOptions={{ exact: true }}
            aria-current={section.key === props.section ? "page" : undefined}
            className={buttonVariants({
              variant: "ghost",
              className:
                "rounded-b-none aria-[current=page]:bg-background aria-[current=page]:font-semibold",
            })}
          >
            {section.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
