import type { SnapshotManifest, SnapshotPage } from "@repo/contracts/snapshot";

import { redirectFor } from "./seo.ts";

/** What a site answers at an address: its page, a redirect, or why there's no page. */
export type Answer =
  | { readonly kind: "page"; readonly entry: SnapshotPage }
  | { readonly kind: "redirect"; readonly to: string }
  | {
      readonly kind: "missing";
      readonly status: 404 | 410;
      /** True on a new site, whose first release has no pages until its first draft publishes. */
      readonly unpublished: boolean;
    };

/** What the live release answers at a path. A path a page left answers 410 unless a redirect covers it. */
export const answerAt = (manifest: SnapshotManifest, path: string): Answer => {
  const entry = manifest.pages.find((candidate) => candidate.path === path);
  if (entry !== undefined) return { kind: "page", entry };
  const to = redirectFor(manifest, path);
  if (to !== null) return { kind: "redirect", to };
  return {
    kind: "missing",
    status: manifest.gone.includes(path) ? 410 : 404,
    unpublished: manifest.pages.length === 0,
  };
};
