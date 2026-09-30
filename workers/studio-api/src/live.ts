import { D1Client } from "@effect/sql-d1";
import { DraftId, SiteId } from "@repo/contracts/ids";
import { liveBasePath } from "@repo/contracts/live";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Effect, Option, Schema } from "effect";
import { getServerByName } from "partyserver";

import { authFor } from "./auth.ts";
import { liveAuthorizationHeader, LiveAuthorization } from "./site-doc.ts";
import { siteFor } from "./sites.ts";

const encodeAuthorization = Schema.encodeSync(Schema.fromJsonString(LiveAuthorization));

/**
 * Opens a live connection to one of a site's drafts, at
 * `${liveBasePath}/{site}/{draft}`, for someone signed in to Studio who may
 * edit the site's pages. The WebSocket goes on to SiteDoc with the
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
  const [siteId = "", draftId = ""] = url.pathname.slice(liveBasePath.length + 1).split("/");
  const site = Schema.decodeOption(SiteId)(siteId);
  const draft = Schema.decodeOption(DraftId)(draftId);
  if (Option.isNone(site) || Option.isNone(draft))
    return new Response("Not found", { status: 404 });
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
    encodeAuthorization({
      person: { id, name },
      draft: draft.value,
      permissions: found.value.permissions,
    }),
  );
  const doc = await getServerByName(env.SITE_DOC, site.value);
  return doc.fetch(new Request(request, { headers }));
};
