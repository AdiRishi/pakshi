import type { BrandId, MediaId } from "@repo/contracts/ids";
import { brandMediaBasePath } from "@repo/contracts/studio";

/** The address of an image in a brand's library. */
export const brandMediaSrc = (brand: BrandId, media: MediaId) =>
  `${brandMediaBasePath}/${brand}/${media}`;
