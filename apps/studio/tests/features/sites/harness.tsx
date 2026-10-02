import { latestLockfile } from "@repo/blocks";
import { blockFixtures, fixtureDraft, fixtureSite, fixtureTree } from "@repo/blocks/fixtures";
import { DraftId, ReleaseId, SiteId, SnapshotId } from "@repo/contracts/ids";
import { Timestamp } from "@repo/contracts/release";
import type { SiteOverview } from "@repo/contracts/studio";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "vitest-browser-react";

import { SiteOverviewPanel } from "@/features/sites/site-overview";

const fixture = (type: string, name: string) => {
  const entry = blockFixtures.find(
    (candidate) =>
      candidate.type === type &&
      candidate.name === name &&
      candidate.version === latestLockfile[candidate.type],
  );
  if (entry === undefined) throw new Error(`No fixture ${type} ${name}.`);
  return fixtureTree(entry);
};

const draft = fixtureDraft({
  lockfile: latestLockfile,
  header: fixture("header", "simple"),
  footer: fixture("footer", "simple"),
  sections: [fixture("hero", "centered"), fixture("feature-grid", "three-columns")],
});

const homePage = Object.values(draft.pages).find((page) => page.path === "/");
if (homePage === undefined) throw new Error("The fixture site has a home page.");

export const site = SiteId.make("site_harbour");

const meera = { id: "user_meera", name: "Meera Kapoor" };

const hoursAgo = (hours: number) =>
  Timestamp.make(new Date(Date.now() - hours * 60 * 60 * 1000).toISOString());

/** Harbour Summer School, published two hours ago, with nothing waiting. */
export const published: SiteOverview = {
  site: { id: site, name: "Harbour Summer School" },
  addresses: { own: null, pakshi: "https://harbour.pakshi.test" },
  live: {
    _tag: "Published",
    id: ReleaseId.make("rel_summer"),
    snapshot: SnapshotId.make("snap_summer"),
    at: hoursAgo(2),
    by: meera,
    draft: { id: DraftId.make("dr_summer"), name: "Summer launch" },
    submittedBy: meera,
    approvedBy: [],
  },
  home: {
    settings: fixtureSite.settings,
    parts: draft.parts,
    forms: draft.forms,
    lockfile: draft.lockfile,
    brand: draft.brand,
    pages: fixtureSite.pages,
    media: fixtureSite.media,
    page: homePage,
  },
  editing: { openDrafts: 0, waitingDrafts: 0, blockUpdates: 0, brandUpdate: null },
  newEntries: 0,
};

/** The same site before its first publish, with its first draft open. */
export const unpublished: SiteOverview = {
  ...published,
  live: {
    _tag: "Created",
    id: ReleaseId.make("rel_created"),
    snapshot: SnapshotId.make("snap_created"),
    at: hoursAgo(5),
    by: meera,
  },
  home: null,
  editing: { openDrafts: 1, waitingDrafts: 0, blockUpdates: 0, brandUpdate: null },
};

/** A site's overview, among routes for the tabs its links go to. */
export const renderOverview = (overview: SiteOverview) => {
  const root = createRootRoute();
  const paths = [
    "/",
    "/sites/$siteId",
    "/sites/$siteId/releases",
    "/sites/$siteId/submissions",
    "/sites/$siteId/blocks",
    "/sites/$siteId/drafts/$draftId",
  ];
  const router = createRouter({
    routeTree: root.addChildren(
      paths.map((path) =>
        createRoute({
          getParentRoute: () => root,
          path,
          component: function Tab() {
            return (
              <header className="bg-accent px-10 py-6">
                <SiteOverviewPanel overview={overview} />
              </header>
            );
          },
        }),
      ),
    ),
    history: createMemoryHistory({ initialEntries: [`/sites/${site}`] }),
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};
