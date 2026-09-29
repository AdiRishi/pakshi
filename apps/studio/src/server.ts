import { liveBasePath } from "@repo/contracts/live";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";

/**
 * Studio's Worker. Live connections go to studio-api unchanged, ahead of
 * TanStack Start's request handling, which serves pages and server functions
 * rather than WebSocket upgrades. The browser's cookies and origin travel
 * with the request, and studio-api checks both.
 */
export default createServerEntry({
  fetch(request) {
    if (new URL(request.url).pathname.startsWith(`${liveBasePath}/`))
      return env.STUDIO_API.fetch(request);
    return handler.fetch(request);
  },
});
