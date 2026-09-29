import { D1Client } from "@effect/sql-d1";
import { MediaId } from "@repo/contracts/ids";
import { objectKeys } from "@repo/contracts/snapshot";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Effect, Option, Schema } from "effect";

import { authFor } from "./auth.ts";
import { canSeeMedia } from "./sites.ts";

export const mediaBasePath = "/media";

const notFound = () => new Response("Not found", { status: 404 });

/**
 * A library image from the content bucket, for someone signed in to Studio
 * who may see that library, such as the editor's canvas showing a draft. An
 * image they can't see is answered like one that doesn't exist. Files never
 * change, so each one is cached privately for as long as browsers allow.
 */
export const serveMedia = async (request: Request, env: StudioApiEnv) => {
  const url = new URL(request.url);
  const session = await authFor(env, url.origin).api.getSession({ headers: request.headers });
  if (session === null) return new Response("Sign in to see this image.", { status: 401 });
  const id = Schema.decodeOption(MediaId)(url.pathname.slice(mediaBasePath.length + 1));
  if (Option.isNone(id)) return notFound();
  const { id: userId, name, email } = session.user;
  const visible = await Effect.runPromise(
    canSeeMedia({ id: userId, name, email }, id.value).pipe(
      Effect.provide(D1Client.layer({ db: env.CORE })),
    ),
  );
  if (!visible) return notFound();
  const object = await env.CONTENT.get(objectKeys.media(id.value));
  if (object === null) return notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=31536000, immutable");
  return new Response(object.body, { headers });
};
