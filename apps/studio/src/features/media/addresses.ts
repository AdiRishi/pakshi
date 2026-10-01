import type { MediaId, SiteId } from "@repo/contracts/ids";
import { siteMediaBasePath } from "@repo/contracts/studio";

/** Where Studio shows an image a site can place, from its library or its brand's. */
export const siteMediaSrc = (site: SiteId, media: MediaId) =>
  `${siteMediaBasePath}/${site}/${media}`;
