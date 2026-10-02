import { noIdentity } from "@repo/contracts/brand";
import { BrandId, MediaId, SiteId } from "@repo/contracts/ids";
import type { BrandSummary, Viewer } from "@repo/contracts/studio";
import { defaultTheme, resolveTheme, type ThemeValues } from "@repo/tokens";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useParams,
} from "@tanstack/react-router";
import { render } from "vitest-browser-react";

import { Brands } from "@/features/brands/brands";

const viewer = (createBrand: boolean): Viewer => ({
  user: { id: "user_priya", name: "Priya Shah", email: "priya@harbour.test" },
  organization: "Harbour Schools",
  roles: [{ role: createBrand ? "Org admin" : "Editor", scope: "Harbour Schools" }],
  sites: [],
  approvalsWaiting: 0,
  brands: true,
  can: {
    createBrand,
    createSite: createBrand,
    invite: createBrand,
    manageRoles: createBrand,
    editWorkflow: createBrand,
    readAudit: createBrand,
    upgradeBlocks: false,
  },
});

/** A brand as the list shows it, in the default theme with `look` laid over it. */
export const brand = (options: {
  readonly id: string;
  readonly name: string;
  readonly look?: Partial<ThemeValues>;
  readonly logo?: { readonly light: string; readonly onDark: string | null };
  readonly tone?: string;
  readonly sites?: ReadonlyArray<string>;
}): BrandSummary => ({
  id: BrandId.make(options.id),
  name: options.name,
  theme: resolveTheme({ ...defaultTheme, ...options.look }).theme,
  identity:
    options.logo === undefined
      ? noIdentity
      : {
          logo: MediaId.make(options.logo.light),
          logoOnDark: options.logo.onDark === null ? null : MediaId.make(options.logo.onDark),
          favicon: null,
        },
  tone: options.tone ?? "",
  sites: (options.sites ?? []).map((name) => ({
    id: SiteId.make(`site_${name.replaceAll(" ", "")}`),
    name,
  })),
});

/** Three brands that look nothing alike. */
export const brands: ReadonlyArray<BrandSummary> = [
  brand({
    id: "brand_yoga",
    name: "Abhyas School of Yoga",
    look: {
      brandColor: "#7c3a2d",
      fonts: { heading: "fraunces", body: "source-sans-3" },
      headingWeight: 500,
      radius: "large",
      shadow: "soft",
    },
    logo: { light: "med_yogaLogo", onDark: "med_yogaLogoDark" },
    tone: "Calm and encouraging. We speak to beginners as friends, never as students who are behind.",
    sites: ["Abhyas Yoga", "Teacher Training"],
  }),
  brand({
    id: "brand_parks",
    name: "City Parks",
    look: {
      brandColor: "#1f5c44",
      neutral: "cool",
      fonts: { heading: "bricolage-grotesque", body: "onest" },
      headingWeight: 800,
      radius: "none",
      shadow: "flat",
    },
    sites: ["Trails"],
  }),
  brand({
    id: "brand_museums",
    name: "Harbour Museums",
    look: {
      brandColor: "#1d3a8a",
      neutral: "neutral",
      fonts: { heading: "source-serif-4", body: "source-serif-4" },
      headingWeight: 700,
      radius: "small",
      shadow: "raised",
    },
  }),
];

/**
 * The Brands page showing `list`, for someone who may or may not make
 * brands. A brand made from it gets the ID `brand_new`.
 */
export const renderBrands = async (options: {
  readonly list: ReadonlyArray<BrandSummary>;
  readonly createBrand?: boolean;
}) => {
  const root = createRootRoute();
  const list = createRoute({
    getParentRoute: () => root,
    path: "/brands",
    component: () => (
      <Brands
        viewer={viewer(options.createBrand ?? true)}
        brands={options.list}
        create={async () => ({ id: BrandId.make("brand_new") })}
      />
    ),
  });
  const opened = createRoute({
    getParentRoute: () => root,
    path: "/brands/$brandId",
    component: function Opened() {
      return <h1>Opened {useParams({ strict: false }).brandId}</h1>;
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([list, opened]),
    history: createMemoryHistory({ initialEntries: ["/brands"] }),
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};
