import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { identityProviderId } from "@/features/session/auth-client";

/**
 * Starts sign-in with the organization's identity provider. It's a plain link
 * target, so the button works before Studio's JavaScript has loaded.
 */
export const Route = createFileRoute("/sign-in/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const started = await env.STUDIO_API.fetch(
          new Request(`${origin}/api/auth/sign-in/social`, {
            method: "POST",
            headers: { "content-type": "application/json", origin },
            body: JSON.stringify({
              provider: identityProviderId,
              callbackURL: "/",
              errorCallbackURL: "/sign-in",
              disableRedirect: true,
            }),
          }),
        );
        const { url }: { url?: string } = await started.json();
        if (!started.ok || url === undefined)
          return Response.redirect(`${origin}/sign-in?error=start`, 302);
        const headers = new Headers({ location: url });
        for (const cookie of started.headers.getSetCookie()) headers.append("set-cookie", cookie);
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
