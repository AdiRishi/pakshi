import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

// studio-api serves library images to signed-in people. The request goes
// unchanged, so the session cookie travels with it.
export const Route = createFileRoute("/media/$mediaId")({
  server: { handlers: { GET: ({ request }) => env.STUDIO_API.fetch(request) } },
});
