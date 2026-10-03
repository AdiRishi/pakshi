import { agentBasePath } from "@repo/contracts/agent";
import { liveBasePath } from "@repo/contracts/live";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";

import { servePreview } from "@/features/preview/serve";

/**
 * Studio's Worker. Live connections and conversations with the agent go to
 * studio-api unchanged, ahead of TanStack Start's request handling, which
 * serves pages and server functions rather than WebSocket upgrades. The
 * browser's cookies and origin travel with the request, and studio-api
 * checks both. A preview's or review's access, images and status are
 * settled here, before TanStack Start renders its page.
 */
export default createServerEntry({
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith(`${liveBasePath}/`) || pathname.startsWith(`${agentBasePath}/`))
      return env.STUDIO_API.fetch(request);
    const preview = await servePreview(request, (shown) =>
      handler.fetch(request, { context: { preview: shown } }),
    );
    return preview ?? handler.fetch(request, { context: { preview: null } });
  },
});
