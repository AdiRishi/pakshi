import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

// studio-api runs Better Auth. Forwarding the request unchanged keeps the
// browser's URL, cookies and origin, so the session belongs to Studio's host.
const forward = ({ request }: { readonly request: Request }) => env.STUDIO_API.fetch(request);

export const Route = createFileRoute("/api/auth/$")({
  server: { handlers: { GET: forward, POST: forward } },
});
