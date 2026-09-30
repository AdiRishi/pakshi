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

import { SiteHeader } from "../sites/site-header";
import { WorkflowEditor, workflowQuery } from "./workflow-editor";

const description =
  "Changes go through these steps in order before going live. A workflow can be set on the organization, a brand or a site, and the nearest one applies.";

/** A site's approval workflow, among the site's sections. */
export function SiteWorkflowPage(props: {
  readonly viewer: Viewer;
  readonly scope: Extract<Scope, { kind: "site" }>;
}) {
  const { data } = useSuspenseQuery(workflowQuery(props.scope));
  return (
    <AppShell viewer={props.viewer}>
      <SiteHeader
        site={{ id: props.scope.id, name: data.name }}
        section="workflow"
        description={description}
      />
      <div className="px-10 py-8">
        <WorkflowEditor key={JSON.stringify(data.own)} view={data} />
      </div>
    </AppShell>
  );
}

/** A brand's or the organization's approval workflow, which sites below it use unless they set their own. */
export function ScopeWorkflowPage(props: {
  readonly viewer: Viewer;
  readonly scope: Exclude<Scope, { kind: "site" }>;
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
