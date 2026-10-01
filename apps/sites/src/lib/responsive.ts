import type { ResolvedMedia } from "@repo/blocks";
import type { MediaId } from "@repo/contracts/ids";
import type { MediaFile } from "@repo/contracts/snapshot";

/** The widths `sites` serves library images at, besides their own. */
export const imageWidths = [480, 960, 1600, 2400] as const;

/**
 * A library image as blocks render it: the original, and every width smaller
 * than it for the browser to choose from.
 */
export const responsiveImage = (media: MediaId, file: MediaFile): ResolvedMedia => {
  const src = `/_media/${media}`;
  const smaller = imageWidths.filter((width) => width < file.width);
  return {
    src,
    width: file.width,
    height: file.height,
    srcSet: [
      ...smaller.map((width) => `${src}?width=${width} ${width}w`),
      `${src} ${file.width}w`,
    ].join(", "),
  };
};
