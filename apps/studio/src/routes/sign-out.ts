import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

/**
 * Ends the session. It's a form target, so the button works before Studio's
 * JavaScript has loaded. The browser's own Origin header goes to Better Auth,
 * whose trusted-origin check turns away a sign-out posted from another site.
 */
export const Route = createFileRoute("/sign-out")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const headers = new Headers({ "content-type": "application/json" });
        for (const name of ["cookie", "origin"]) {
          const value = request.headers.get(name);
          if (value !== null) headers.set(name, value);
        }
        const signedOut = await env.STUDIO_API.fetch(
          new Request(`${origin}/api/auth/sign-out`, { method: "POST", headers, body: "{}" }),
        );
        if (!signedOut.ok) return Response.redirect(`${origin}/`, 303);
        const response = new Headers({ location: `${origin}/sign-in` });
        for (const cookie of signedOut.headers.getSetCookie())
          response.append("set-cookie", cookie);
        return new Response(null, { status: 303, headers: response });
      },
    },
  },
});
