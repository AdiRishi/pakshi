import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

/**
 * Adds an image to a library. studio-api checks the person may, with the
 * cookie and origin that travel with the request, and reads the file itself.
 */
export const Route = createFileRoute("/api/media")({
  server: { handlers: { POST: ({ request }) => env.STUDIO_API.fetch(request) } },
});
