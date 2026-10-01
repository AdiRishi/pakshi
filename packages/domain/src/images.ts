import type { MediaFile } from "@repo/contracts/snapshot";

/*
 * What an uploaded image is, read from its own bytes rather than from what
 * the browser said it was: its format and size in pixels. Only the formats
 * a site's library takes are recognised.
 */

type ImageInfo = Pick<MediaFile, "contentType" | "width" | "height">;

const startsWith = (bytes: Uint8Array, prefix: ReadonlyArray<number>, at = 0) =>
  prefix.every((byte, index) => bytes[at + index] === byte);

const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length));

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const png = (bytes: Uint8Array): ImageInfo | null =>
  startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) &&
  ascii(bytes, 12, 4) === "IHDR"
    ? {
        contentType: "image/png",
        width: view(bytes).getUint32(16),
        height: view(bytes).getUint32(20),
      }
    : null;

/** JPEG's start-of-frame markers, which carry the image's size. */
const startOfFrame = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

const jpeg = (bytes: Uint8Array): ImageInfo | null => {
  if (!startsWith(bytes, [0xff, 0xd8])) return null;
  const data = view(bytes);
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1] ?? 0;
    if (startOfFrame.has(marker))
      return {
        contentType: "image/jpeg",
        width: data.getUint16(at + 7),
        height: data.getUint16(at + 5),
      };
    at += 2 + data.getUint16(at + 2);
  }
  return null;
};

const webp = (bytes: Uint8Array): ImageInfo | null => {
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;
  const data = view(bytes);
  switch (ascii(bytes, 12, 4)) {
    case "VP8 ":
      return {
        contentType: "image/webp",
        width: data.getUint16(26, true) & 0x3fff,
        height: data.getUint16(28, true) & 0x3fff,
      };
    case "VP8L": {
      const bits = data.getUint32(21, true);
      return {
        contentType: "image/webp",
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    case "VP8X":
      return {
        contentType: "image/webp",
        width: 1 + ((bytes[24] ?? 0) | ((bytes[25] ?? 0) << 8) | ((bytes[26] ?? 0) << 16)),
        height: 1 + ((bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16)),
      };
    default:
      return null;
  }
};

/** AVIF keeps its size in an `ispe` box inside its metadata. */
const avif = (bytes: Uint8Array): ImageInfo | null => {
  if (ascii(bytes, 4, 4) !== "ftyp" || !["avif", "avis"].includes(ascii(bytes, 8, 4))) return null;
  const data = view(bytes);
  const limit = Math.min(bytes.length - 20, 64 * 1024);
  for (let at = 0; at < limit; at += 1)
    if (ascii(bytes, at, 4) === "ispe")
      return {
        contentType: "image/avif",
        width: data.getUint32(at + 8),
        height: data.getUint32(at + 12),
      };
  return null;
};

/** An image's format and size in pixels, or null when it isn't a JPEG, PNG, WebP or AVIF image. */
export const imageInfo = (bytes: Uint8Array): ImageInfo | null => {
  const found = png(bytes) ?? jpeg(bytes) ?? webp(bytes) ?? avif(bytes);
  return found !== null && found.width > 0 && found.height > 0 ? found : null;
};
