import type { BrandId } from "@repo/contracts/ids";
import { Badge } from "@repo/ui/components/badge";
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

const sections = [
  { key: "theme", label: "Theme", to: "/brands/$brandId" },
  { key: "identity", label: "Identity and voice", to: "/brands/$brandId/identity" },
  { key: "workflow", label: "Approval workflow", to: "/brands/$brandId/workflow" },
  { key: "sites", label: "Sites", to: "/brands/$brandId/sites" },
] as const;

/** A brand's name, how many sites use it, and links to the brand's sections. */
export function BrandHeader(props: {
  readonly brand: { readonly id: BrandId; readonly name: string };
  readonly sites: number;
  readonly section: (typeof sections)[number]["key"];
  readonly actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 bg-accent px-10 pt-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/brands" />}>Brands</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{props.brand.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{props.brand.name}</h1>
        <Badge variant="secondary">{props.sites === 1 ? "1 site" : `${props.sites} sites`}</Badge>
        <div className="ml-auto flex items-center gap-2">{props.actions}</div>
      </div>
      <nav aria-label="Brand sections" className="flex gap-1">
        {sections.map((section) => (
          <Link
            key={section.key}
            to={section.to}
            params={{ brandId: props.brand.id }}
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
