import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

/**
 * An image in a brand's library, for Theme Studio and the brand's identity.
 * studio-api checks the person may see the brand, with the cookie that
 * travels with the request.
 */
export const Route = createFileRoute("/brand-media/$brandId/$mediaId")({
  server: { handlers: { GET: ({ request }) => env.STUDIO_API.fetch(request) } },
});
