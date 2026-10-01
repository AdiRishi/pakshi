import type { BrandId, SiteId } from "@repo/contracts/ids";
import { imageLimit, MediaSummary, mediaUploadPath, UploadRefusal } from "@repo/contracts/studio";
import { Option, Schema } from "effect";

const decodeImage = Schema.decodeUnknownSync(MediaSummary);
const decodeRefusal = Schema.decodeUnknownOption(UploadRefusal);

const refusals = {
  "not-image": "Only JPEG, PNG, WebP and AVIF images can go in the library.",
  "too-large": `Images can be at most ${imageLimit / 1024 / 1024} MB.`,
  "not-permitted": "You can't add images to this library.",
} as const satisfies Record<UploadRefusal["reason"], string>;

/** The library an image is uploaded to. */
export type Library =
  | { readonly kind: "site"; readonly id: SiteId }
  | { readonly kind: "brand"; readonly id: BrandId };

/**
 * Adds an image to a library from the browser, and returns it as the library
 * lists it. Throws an error that says why when the library refuses it.
 */
export const uploadImage = async (file: File, library: Library) => {
  if (file.size > imageLimit) throw new Error(refusals["too-large"]);
  const search = new URLSearchParams({ [library.kind]: library.id, name: file.name });
  const response = await fetch(`${mediaUploadPath}?${search.toString()}`, {
    method: "POST",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return decodeImage(body);
  const refusal = decodeRefusal(body);
  throw new Error(
    Option.isSome(refusal)
      ? refusals[refusal.value.reason]
      : "The image couldn't be uploaded. Please try again.",
  );
};
