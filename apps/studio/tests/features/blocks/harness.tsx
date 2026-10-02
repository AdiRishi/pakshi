import type { Viewer } from "@repo/contracts/studio";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useSearch,
} from "@tanstack/react-router";
import { Schema } from "effect";
import type { ReactNode } from "react";
import { render } from "vitest-browser-react";

import { BlockGallery, BlocksSearch } from "@/features/blocks/gallery";

export const viewer: Viewer = {
  user: { id: "user_meera", name: "Meera Kapoor", email: "meera@harbour.test" },
  organization: "Harbour Schools",
  roles: [{ role: "Editor", scope: "Harbour Schools" }],
  sites: [],
  approvalsWaiting: 0,
  brands: false,
  can: {
    createBrand: false,
    createSite: false,
    invite: false,
    manageRoles: false,
    editWorkflow: false,
    readAudit: false,
    upgradeBlocks: false,
  },
};

/** The blocks page at `path`, with `onAsk` behind its request buttons. */
export const renderGallery = (options: {
  readonly path?: string;
  readonly onAsk?: () => void;
  readonly updates?: ReactNode;
}) => {
  const root = createRootRoute();
  const blocks = createRoute({
    getParentRoute: () => root,
    path: "/blocks",
    validateSearch: Schema.toStandardSchemaV1(BlocksSearch),
    component: function Blocks() {
      return (
        <BlockGallery
          viewer={viewer}
          tab={useSearch({ strict: false }).tab ?? "all"}
          onTab={() => undefined}
          onAsk={options.onAsk ?? null}
          asked={<p>Requests</p>}
          updates={options.updates ?? null}
        />
      );
    },
  });
  const block = createRoute({ getParentRoute: () => root, path: "/blocks/$blockType" });
  const router = createRouter({
    routeTree: root.addChildren([blocks, block]),
    history: createMemoryHistory({ initialEntries: [options.path ?? "/blocks"] }),
  });
  return render(<RouterProvider router={router} />);
};
