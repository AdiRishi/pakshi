import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { imageInfo } from "../src/images.ts";

const fixture = async (name: string) =>
  new Uint8Array(await readFile(join(import.meta.dirname, "../../../fixtures/media", name)));

/** A WebP file's first bytes with an extended (VP8X) header for an image of this size. */
const webpHeader = (width: number, height: number) => {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WEBPVP8X"), 8);
  const little = (value: number, at: number) => {
    bytes[at] = value & 0xff;
    bytes[at + 1] = (value >> 8) & 0xff;
    bytes[at + 2] = (value >> 16) & 0xff;
  };
  little(width - 1, 24);
  little(height - 1, 27);
  return bytes;
};

/** An AVIF file's first bytes: its file type, then the box that holds its size. */
const avifHeader = (width: number, height: number) => {
  const bytes = new Uint8Array(64);
  const data = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("ftypavif"), 4);
  bytes.set(new TextEncoder().encode("ispe"), 40);
  data.setUint32(48, width);
  data.setUint32(52, height);
  return bytes;
};

describe("reading an image's format and size from its bytes", () => {
  test("knows a JPEG and a PNG from the sample site", async () => {
    expect(imageInfo(await fixture("med_harbour.jpg"))).toEqual({
      contentType: "image/jpeg",
      width: 1600,
      height: 1067,
    });
    expect(imageInfo(await fixture("med_harbourlogo.png"))).toEqual({
      contentType: "image/png",
      width: 678,
      height: 136,
    });
  });

  test("knows a WebP and an AVIF image", () => {
    expect(imageInfo(webpHeader(2400, 1600))).toEqual({
      contentType: "image/webp",
      width: 2400,
      height: 1600,
    });
    expect(imageInfo(avifHeader(1200, 800))).toEqual({
      contentType: "image/avif",
      width: 1200,
      height: 800,
    });
  });

  test("refuses anything else, whatever it's called", () => {
    expect(imageInfo(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBe(
      null,
    );
    expect(imageInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(null);
  });

  test("refuses an image cut off before its size", async () => {
    expect(imageInfo((await fixture("med_harbourlogo.png")).subarray(0, 20))).toBe(null);
    expect(imageInfo(webpHeader(2400, 1600).subarray(0, 20))).toBe(null);
  });
});
