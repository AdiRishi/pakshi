import { liveBasePath } from "@repo/contracts/live";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Result, Schema } from "effect";
import { getServerByName } from "partyserver";

import { editorOf } from "./editors.ts";
import { liveAuthorizationHeader, LiveAuthorization } from "./site-doc.ts";

const encodeAuthorization = Schema.encodeSync(Schema.fromJsonString(LiveAuthorization));

/**
 * Opens a live connection to one of a site's drafts, at
 * `${liveBasePath}/{site}/{draft}`, for someone who may edit it. The
 * WebSocket goes on to SiteDoc with the person and their permissions in a
 * header this Worker sets, replacing any the browser sent.
 */
export const serveLive = async (request: Request, env: StudioApiEnv) => {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
    return new Response("Expected a WebSocket.", { status: 426 });
  const editor = await editorOf(request, env, liveBasePath);
  if (Result.isFailure(editor)) return editor.failure;
  const { person, site, draft, permissions } = editor.success;
  const headers = new Headers(request.headers);
  headers.set(
    liveAuthorizationHeader,
    encodeAuthorization({ person: { id: person.id, name: person.name }, draft, permissions }),
  );
  const doc = await getServerByName(env.SITE_DOC, site.id);
  return doc.fetch(new Request(request, { headers }));
};
