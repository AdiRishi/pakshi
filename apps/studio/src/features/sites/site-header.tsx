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
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { siteOverviewQuery } from "./queries";
import { SiteOverviewPanel } from "./site-overview";

/** The top of every site page: where the site is and what's live, over links to its tabs. */
export function SiteHeader(props: {
  readonly site: SiteId;
  readonly section: "drafts" | "releases" | "submissions" | "media" | "blocks" | "settings";
}) {
  const { data } = useSuspenseQuery(siteOverviewQuery(props.site));
  const sections = [
    { key: "drafts", label: "Drafts", to: "/sites/$siteId" },
    { key: "releases", label: "Releases", to: "/sites/$siteId/releases" },
    { key: "submissions", label: "Submissions", to: "/sites/$siteId/submissions" },
    { key: "media", label: "Media", to: "/sites/$siteId/media" },
    { key: "blocks", label: "Blocks", to: "/sites/$siteId/blocks" },
    { key: "settings", label: "Settings", to: "/sites/$siteId/settings" },
  ] as const;
  return (
    <header className="flex flex-col gap-6 bg-accent px-10 pt-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/" />}>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{data.site.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <SiteOverviewPanel overview={data} />
      <nav aria-label="Site sections" className="flex flex-wrap gap-1">
        {sections.map((section) => (
          <Link
            key={section.key}
            to={section.to}
            params={{ siteId: props.site }}
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
