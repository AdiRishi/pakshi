import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

/**
 * An image a site can place, for its settings and media screens. studio-api
 * checks the person works on the site, with the cookie that travels with the
 * request.
 */
export const Route = createFileRoute("/site-media/$siteId/$mediaId")({
  server: { handlers: { GET: ({ request }) => env.STUDIO_API.fetch(request) } },
});
