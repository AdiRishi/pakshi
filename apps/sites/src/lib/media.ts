import { MediaId } from "@repo/contracts/ids";
import { objectKeys } from "@repo/contracts/snapshot";
import { env } from "cloudflare:workers";
import { Option, Schema } from "effect";

import { imageWidths } from "./responsive.ts";

const immutable = "public, max-age=31536000, immutable";

/** The format to send a resized image in: the smallest one the browser says it takes. */
const formatFor = (accept: string, original: string) => {
  if (accept.includes("image/avif")) return "image/avif";
  if (accept.includes("image/webp")) return "image/webp";
  return original === "image/png" ? "image/png" : "image/jpeg";
};

const original = async (media: MediaId) => {
  const object = await env.CONTENT.get(objectKeys.media(media));
  if (object === null) return null;
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", immutable);
  return { body: object.body, headers };
};

/**
 * A library image at one of the widths blocks ask for, in the best format the
 * browser takes. Resized copies are cached, since files never change. When
 * resizing fails, the original is served instead.
 */
const resized = async (
  media: MediaId,
  width: number,
  request: Request,
  waitUntil: (promise: Promise<unknown>) => void,
) => {
  const source = await original(media);
  if (source === null) return null;
  const format = formatFor(
    request.headers.get("accept") ?? "",
    source.headers.get("content-type") ?? "image/jpeg",
  );
  const key = new Request(`https://media-cache.pakshi/${media}/${width}/${format}`);
  const cache = await caches.open("media");
  const cached = await cache.match(key);
  if (cached !== undefined) return cached;
  try {
    const output = await env.IMAGES.input(source.body)
      .transform({ width, fit: "scale-down" })
      .output({ format });
    const response = new Response(output.image(), {
      headers: { "content-type": output.contentType(), "cache-control": immutable, vary: "Accept" },
    });
    waitUntil(cache.put(key, response.clone()));
    return response;
  } catch (error) {
    console.warn(`Resizing ${media} to ${width} failed, so it was served as it is`, error);
    const fallback = await original(media);
    return fallback === null ? null : new Response(fallback.body, { headers: fallback.headers });
  }
};

/** Media files never change, so each is cached for as long as browsers allow. */
export const serveMedia = async (
  request: Request,
  waitUntil: (promise: Promise<unknown>) => void,
) => {
  const url = new URL(request.url);
  const media = Schema.decodeOption(MediaId)(url.pathname.slice("/_media/".length));
  if (Option.isNone(media)) return new Response("Not found", { status: 404 });
  const width = Number(url.searchParams.get("width"));
  const served = imageWidths.some((allowed) => allowed === width)
    ? await resized(media.value, width, request, waitUntil)
    : await original(media.value).then((found) =>
        found === null ? null : new Response(found.body, { headers: found.headers }),
      );
  return served ?? new Response("Not found", { status: 404 });
};
