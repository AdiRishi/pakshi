import type { Scope } from "@repo/contracts/access";
import type { Viewer } from "@repo/contracts/studio";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/components/breadcrumb";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";

import { BrandHeader } from "../brands/brand-header";
import { brandQuery } from "../brands/queries";
import { SettingsShell } from "../settings/settings-shell";
import { WorkflowEditor, workflowQuery } from "./workflow-editor";

const description =
  "Changes go through these steps in order before going live. A workflow can be set on the organization, a brand or a site, and the nearest one applies.";

/** A site's approval workflow, among the site's settings. */
export function SiteWorkflowPage(props: {
  readonly viewer: Viewer;
  readonly scope: Extract<Scope, { kind: "site" }>;
}) {
  const { data } = useSuspenseQuery(workflowQuery(props.scope));
  return (
    <SettingsShell
      viewer={props.viewer}
      site={{ id: props.scope.id, name: data.name }}
      page="workflow"
      title="Approval workflow"
      description={description}
    >
      <WorkflowEditor key={JSON.stringify(data.own)} view={data} />
    </SettingsShell>
  );
}

/** A brand's approval workflow, among the brand's sections. */
export function BrandWorkflowPage(props: {
  readonly viewer: Viewer;
  readonly scope: Extract<Scope, { kind: "brand" }>;
}) {
  const { data } = useSuspenseQuery(workflowQuery(props.scope));
  const { data: brand } = useSuspenseQuery(brandQuery(props.scope.id));
  return (
    <AppShell viewer={props.viewer}>
      <BrandHeader brand={brand.brand} sites={brand.sites.length} section="workflow" />
      <div className="flex flex-col gap-6 px-10 py-8">
        <p className="text-secondary-foreground">{description}</p>
        <WorkflowEditor key={JSON.stringify(data.own)} view={data} />
      </div>
    </AppShell>
  );
}

/** The organization's approval workflow, which brands and sites use unless they set their own. */
export function OrganizationWorkflowPage(props: {
  readonly viewer: Viewer;
  readonly scope: Extract<Scope, { kind: "organization" }>;
}) {
  const { data } = useSuspenseQuery(workflowQuery(props.scope));
  return (
    <AppShell viewer={props.viewer}>
      <header className="flex flex-col gap-3 bg-accent px-10 pt-6 pb-8">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/" />}>Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{data.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="text-3xl font-semibold tracking-tight">{data.name}: approval workflow</h1>
        <p className="text-secondary-foreground">{description}</p>
      </header>
      <div className="px-10 py-8">
        <WorkflowEditor key={JSON.stringify(data.own)} view={data} />
      </div>
    </AppShell>
  );
}
