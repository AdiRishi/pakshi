import { identityProviderId } from "@repo/contracts/studio";
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { Schema } from "effect";

const SignInStarted = Schema.Struct({ url: Schema.String });

/**
 * Starts sign-in with the organization's identity provider. It's a plain link
 * target, so the button works before Studio's JavaScript has loaded.
 */
export const Route = createFileRoute("/sign-in_/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const failed = Response.redirect(`${origin}/sign-in?error=start`, 302);
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
        if (!started.ok) return failed;
        const body = Schema.decodeOption(Schema.fromJsonString(SignInStarted))(
          await started.text(),
        );
        if (body._tag === "None") return failed;
        const headers = new Headers({ location: body.value.url });
        for (const cookie of started.headers.getSetCookie()) headers.append("set-cookie", cookie);
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
