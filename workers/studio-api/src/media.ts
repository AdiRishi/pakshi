import { MediaId } from "@repo/contracts/ids";
import { objectKeys } from "@repo/contracts/snapshot";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Option, Schema } from "effect";

import { authFor } from "./auth.ts";

export const mediaBasePath = "/media";

/**
 * An image from the content bucket, for someone signed in to Studio, such as
 * the editor's canvas showing a draft. Files never change, so each one is
 * cached privately for as long as browsers allow.
 */
export const serveMedia = async (request: Request, env: StudioApiEnv) => {
  const url = new URL(request.url);
  const session = await authFor(env, url.origin).api.getSession({ headers: request.headers });
  if (session === null) return new Response("Sign in to see this image.", { status: 401 });
  const id = Schema.decodeOption(MediaId)(url.pathname.slice(mediaBasePath.length + 1));
  if (Option.isNone(id)) return new Response("Not found", { status: 404 });
  const object = await env.CONTENT.get(objectKeys.media(id.value));
  if (object === null) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=31536000, immutable");
  return new Response(object.body, { headers });
};
