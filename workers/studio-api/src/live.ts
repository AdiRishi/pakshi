import { D1Client } from "@effect/sql-d1";
import { SiteId } from "@repo/contracts/ids";
import { liveBasePath } from "@repo/contracts/live";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Effect, Option, Schema } from "effect";
import { getServerByName } from "partyserver";

import { authFor } from "./auth.ts";
import { liveAuthorizationHeader, LiveAuthorization } from "./site-doc.ts";
import { siteFor } from "./sites.ts";

const encodeAuthorization = Schema.encodeSync(Schema.fromJsonString(LiveAuthorization));

/**
 * Opens a live connection to a site's SiteDoc for someone signed in to
 * Studio who may edit its pages. The WebSocket goes on to SiteDoc with the
 * person and their permissions in a header this Worker sets, replacing any
 * the browser sent. Browsers send cookies with a WebSocket from any page, so
 * the connection must come from Studio's own origin.
 */
export const serveLive = async (request: Request, env: StudioApiEnv) => {
  const url = new URL(request.url);
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
    return new Response("Expected a WebSocket.", { status: 426 });
  if (request.headers.get("origin") !== url.origin)
    return new Response("Not allowed from this origin.", { status: 403 });
  const session = await authFor(env, url.origin).api.getSession({ headers: request.headers });
  if (session === null) return new Response("Sign in to edit.", { status: 401 });
  const site = Schema.decodeOption(SiteId)(url.pathname.slice(liveBasePath.length + 1));
  if (Option.isNone(site)) return new Response("Not found", { status: 404 });
  const { id, name, email } = session.user;
  const found = await Effect.runPromise(
    siteFor({ id, name, email }, site.value, "page.edit").pipe(
      Effect.asSome,
      Effect.catchTag("SiteNotFound", () => Effect.succeedNone),
      Effect.provide(D1Client.layer({ db: env.CORE })),
    ),
  );
  if (Option.isNone(found)) return new Response("Not found", { status: 404 });
  const headers = new Headers(request.headers);
  headers.set(
    liveAuthorizationHeader,
    encodeAuthorization({ person: { id, name }, permissions: found.value.permissions }),
  );
  const doc = await getServerByName(env.SITE_DOC, site.value);
  return doc.fetch(new Request(request, { headers }));
};
