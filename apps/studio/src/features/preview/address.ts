import type { DraftId, MediaId, SiteId } from "@repo/contracts/ids";
import { PagePath } from "@repo/contracts/page";
import { mediaSegment, previewBasePath } from "@repo/contracts/studio";
import { Option, Schema } from "effect";

/** A draft's preview link, which Studio serves at its own address. */
export const previewPath = (site: SiteId, draft: DraftId) => `${previewBasePath}/${site}/${draft}/`;

/**
 * Where a draft's images load from: under its preview, for anyone who may
 * open the draft, the editor included.
 */
export const draftImage = (site: SiteId, draft: DraftId) => (media: MediaId) =>
  `${previewBasePath}/${site}/${draft}/${mediaSegment}/${media}`;

/**
 * What the rest of a preview's or review's address asks for: one of its
 * images, a page by its address on the site, or nothing it can serve.
 */
export const requested = (rest: string) => {
  if (rest.startsWith(`${mediaSegment}/`)) return { kind: "media" } as const;
  const path = Schema.decodeOption(PagePath)(`/${rest.replace(/\/$/, "")}`);
  return Option.isSome(path) ? ({ kind: "page", path: path.value } as const) : null;
};
