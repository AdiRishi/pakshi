/*
 * Whether a re-shot baseline screenshot shows the same picture as before. A
 * re-shoot changes how the browser suite takes screenshots, never what a
 * block renders, so the two must match pixel for pixel. Only their edge rows
 * may differ: a block's top and bottom edges fall between pixels, so the row
 * each one crosses, and whether the screenshot includes it, depends on where
 * the block sat on the page.
 */
import { inflateSync } from "node:zlib";

/** A PNG's pixels, each row as RGBA, or why they can't be read. */
type Decoded =
  | { readonly _tag: "Pixels"; readonly width: number; readonly rows: ReadonlyArray<Uint8Array> }
  | { readonly _tag: "Unreadable"; readonly reason: string };

const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const paeth = (left: number, up: number, upLeft: number) => {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
};

/**
 * The pixels of an 8-bit, non-interlaced RGB or RGBA PNG, as Playwright
 * writes screenshots, or a reason it can't read the file.
 */
const decode = (file: Buffer): Decoded => {
  if (!file.subarray(0, 8).equals(signature)) return { _tag: "Unreadable", reason: "isn't a PNG" };
  let width = 0;
  let height = 0;
  let channels = 0;
  const data: Array<Buffer> = [];
  for (let offset = 8; offset + 8 <= file.length;) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("latin1", offset + 4, offset + 8);
    const chunk = file.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      const [depth, color, , , interlace] = chunk.subarray(8, 13);
      if (depth !== 8 || interlace !== 0 || (color !== 2 && color !== 6))
        return { _tag: "Unreadable", reason: "isn't an 8-bit, non-interlaced RGB or RGBA PNG" };
      channels = color === 2 ? 3 : 4;
    }
    if (type === "IDAT") data.push(chunk);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const rows: Array<Uint8Array> = [];
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const start = y * (stride + 1);
    const filter = raw[start];
    const row = Uint8Array.from(raw.subarray(start + 1, start + 1 + stride));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? (row[x - channels] ?? 0) : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= channels ? (previous[x - channels] ?? 0) : 0;
      const predicted =
        filter === 1
          ? left
          : filter === 2
            ? up
            : filter === 3
              ? (left + up) >> 1
              : filter === 4
                ? paeth(left, up, upLeft)
                : 0;
      row[x] = ((row[x] ?? 0) + predicted) & 0xff;
    }
    previous = row;
    if (channels === 4) rows.push(row);
    else {
      const rgba = new Uint8Array(width * 4).fill(0xff);
      for (let x = 0; x < width; x += 1) rgba.set(row.subarray(x * 3, x * 3 + 3), x * 4);
      rows.push(rgba);
    }
  }
  return { _tag: "Pixels", width, rows };
};

const sameRow = (a: Uint8Array | undefined, b: Uint8Array | undefined) =>
  a !== undefined && b !== undefined && Buffer.from(a).equals(Buffer.from(b));

/**
 * Why a re-shot screenshot isn't the same picture as the one it replaces, or
 * null when it is: as wide, at most a row taller or shorter, and identical,
 * pixel for pixel, in every row but each screenshot's first and last.
 */
export const reshootDifference = (before: Buffer, after: Buffer): string | null => {
  const [old, now] = [decode(before), decode(after)];
  if (old._tag === "Unreadable") return `its earlier screenshot ${old.reason}`;
  if (now._tag === "Unreadable") return `its new screenshot ${now.reason}`;
  if (old.width !== now.width) return `it's ${now.width}px wide, where it was ${old.width}px`;
  if (Math.abs(old.rows.length - now.rows.length) > 1)
    return `it's ${now.rows.length}px tall, where it was ${old.rows.length}px`;
  // Row y of the new screenshot shows row y + shift of the old one.
  const matches = [-1, 0, 1].some((shift) => {
    const first = Math.max(1, 1 - shift);
    const last = Math.min(now.rows.length - 2, old.rows.length - 2 - shift);
    for (let y = first; y <= last; y += 1)
      if (!sameRow(now.rows[y], old.rows[y + shift])) return false;
    return true;
  });
  return matches ? null : "its pixels changed inside its edge rows";
};
