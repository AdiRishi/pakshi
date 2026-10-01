import type { Scope } from "@repo/contracts/access";
import type { Viewer } from "@repo/contracts/studio";
import { useSuspenseQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";

import { BrandHeader } from "../brands/brand-header";
import { brandQuery } from "../brands/queries";
import { SettingsShell } from "../settings/settings-shell";
import { MembersPanel } from "./members-panel";
import { scopeMembersQuery } from "./queries";

/** Who can work on a site, among the site's settings. */
export function SiteMembersPage(props: {
  readonly viewer: Viewer;
  readonly scope: Extract<Scope, { kind: "site" }>;
}) {
  const { data } = useSuspenseQuery(scopeMembersQuery(props.scope));
  return (
    <SettingsShell
      viewer={props.viewer}
      site={{ id: props.scope.id, name: data.scope.name }}
      page="members"
      title="Members"
      description={`Who can work on ${data.scope.name}, and what they can do. Changes take effect right away.`}
    >
      <MembersPanel scope={props.scope} viewer={props.viewer.user} />
    </SettingsShell>
  );
}

/** Who can work on a brand and all its sites, among the brand's sections. */
export function BrandMembersPage(props: {
  readonly viewer: Viewer;
  readonly scope: Extract<Scope, { kind: "brand" }>;
}) {
  const { data: brand } = useSuspenseQuery(brandQuery(props.scope.id));
  return (
    <AppShell viewer={props.viewer}>
      <BrandHeader brand={brand.brand} sites={brand.sites.length} section="members" />
      <div className="flex max-w-4xl flex-col gap-6 px-10 py-8">
        <p className="text-secondary-foreground">
          Who can work on {brand.brand.name} and all its sites. Changes take effect right away.
        </p>
        <MembersPanel scope={props.scope} viewer={props.viewer.user} />
      </div>
    </AppShell>
  );
}
