import { MediaId } from "@repo/contracts/ids";
import { objectKeys } from "@repo/contracts/snapshot";
import { env } from "cloudflare:workers";
import { Schema } from "effect";

/** Media files never change, so each is cached for as long as browsers allow. */
export const serveMedia = async (id: string) => {
  const media = Schema.decodeOption(MediaId)(id);
  if (media._tag === "None") return new Response("Not found", { status: 404 });
  const object = await env.CONTENT.get(objectKeys.media(media.value));
  if (object === null) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
};
