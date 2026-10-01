import { agentBasePath } from "@repo/contracts/agent";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Result, Schema } from "effect";
import { getServerByName } from "partyserver";

import { editorOf } from "../editors.ts";
import { AgentAuthorization, agentAuthorizationHeader, conversationName } from "./services.ts";

const encodeAuthorization = Schema.encodeSync(Schema.fromJsonString(AgentAuthorization));

/**
 * Opens someone's conversation with the agent in a draft, at
 * `${agentBasePath}/{site}/{draft}`, and takes the documents they attach
 * below it. The route reaches the signed-in person's own SiteAgent and
 * nothing else, named from the session, with who they are in a header this
 * Worker sets, replacing any the browser sent.
 */
export const serveAgent = async (request: Request, env: StudioApiEnv) => {
  const editor = await editorOf(request, env, agentBasePath);
  if (Result.isFailure(editor)) return editor.failure;
  const { person, site, draft, permissions } = editor.success;
  const headers = new Headers(request.headers);
  headers.set(
    agentAuthorizationHeader,
    encodeAuthorization({
      person,
      site: site.id,
      brand: site.brand,
      draft,
      permissions,
      studio: new URL(request.url).origin,
    }),
  );
  // The agent's batches go to SiteDoc, which checks them against what the person may do.
  await (await getServerByName(env.SITE_DOC, site.id)).holdPermissions(person.id, permissions);
  await env.CORE.prepare(
    "insert or ignore into conversations (site_id, draft_id, user_id) values (?, ?, ?)",
  )
    .bind(site.id, draft, person.id)
    .run();
  const agent = await getServerByName(env.SITE_AGENT, conversationName(site.id, draft, person.id));
  return agent.fetch(new Request(request, { headers }));
};
