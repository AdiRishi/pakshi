import type { Page } from "@playwright/test";

/**
 * The share of pixels in two screenshots that differ by more than a
 * rasterizing difference, such as a shadow drawn at another sub-pixel offset,
 * or null when their sizes differ. It decodes them in a browser page, so the
 * test needs no image libraries.
 */
export const differingPixels = (page: Page, a: Uint8Array, b: Uint8Array) =>
  page.evaluate(
    async ([first, second]) => {
      const pixels = async (data: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext("2d");
        context?.drawImage(image, 0, 0);
        return {
          width: image.width,
          height: image.height,
          data: context?.getImageData(0, 0, image.width, image.height).data,
        };
      };
      const [x, y] = [await pixels(first), await pixels(second)];
      if (
        x.width !== y.width ||
        x.height !== y.height ||
        x.data === undefined ||
        y.data === undefined
      )
        return null;
      let count = 0;
      for (let index = 0; index < x.data.length; index += 4) {
        const channels = [0, 1, 2].map((channel) =>
          Math.abs((x.data?.[index + channel] ?? 0) - (y.data?.[index + channel] ?? 0)),
        );
        if (Math.max(...channels) > 32) count += 1;
      }
      return count / (x.width * x.height);
    },
    [Buffer.from(a).toString("base64"), Buffer.from(b).toString("base64")] as const,
  );
