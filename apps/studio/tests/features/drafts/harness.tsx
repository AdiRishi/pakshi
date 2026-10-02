import { latestLockfile } from "@repo/blocks";
import { DraftId, type PageId, SiteId } from "@repo/contracts/ids";
import type { Op } from "@repo/contracts/ops";
import type { DraftPageSummary } from "@repo/contracts/studio";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "vitest-browser-react";

import { PagesTree } from "@/features/drafts/pages-tree";

const site = SiteId.make("site_harbour");
const draft = DraftId.make("dr_summer");

/**
 * The Pages list of a draft's `pages`, inside a page with room for it. Each batch it
 * sends goes through and lands in `sent`, and each page it makes is opened
 * into `opened`.
 */
export const renderPages = async (pages: ReadonlyArray<DraftPageSummary>) => {
  const sent: Array<ReadonlyArray<Op>> = [];
  const opened: Array<PageId> = [];
  const root = createRootRoute();
  const router = createRouter({
    routeTree: root.addChildren(
      ["/sites/$siteId/drafts/$draftId", "/sites/$siteId/drafts/$draftId/pages/$pageId"].map(
        (path) =>
          createRoute({
            getParentRoute: () => root,
            path,
            component: function Pages() {
              return (
                <main className="bg-background p-10 text-foreground">
                  <PagesTree
                    site={site}
                    draft={{ id: draft, name: "Summer launch" }}
                    pages={pages}
                    menus={{ main: [], footer: [] }}
                    lockfile={latestLockfile}
                    author="Meera Kapoor"
                    send={async (ops) => {
                      sent.push(ops);
                      return [];
                    }}
                    onCreated={async (page) => {
                      opened.push(page);
                    }}
                  />
                </main>
              );
            },
          }),
      ),
    ),
    history: createMemoryHistory({ initialEntries: [`/sites/${site}/drafts/${draft}`] }),
  });
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { sent, opened };
};
