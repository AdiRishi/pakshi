import { identityProviderId } from "@repo/contracts/studio";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins/generic-oauth";

export const authBasePath = "/api/auth";

const createAuth = (env: StudioApiEnv, origin: string) =>
  betterAuth({
    database: env.CORE,
    secret: env.AUTH_SECRET,
    // Studio forwards requests unchanged, so the origin is the one the browser
    // sees, and cookies and the OAuth redirect belong to Studio's host.
    baseURL: `${origin}${authBasePath}`,
    basePath: authBasePath,
    trustedOrigins: [origin],
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    // People are granted access by email before they first sign in, so their
    // first sign-in links to the user that already exists.
    account: { accountLinking: { trustedProviders: [identityProviderId] } },
    session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
    plugins: [
      genericOAuth({
        config: [
          {
            providerId: identityProviderId,
            discoveryUrl: env.OIDC_DISCOVERY_URL,
            clientId: env.OIDC_CLIENT_ID,
            clientSecret: env.OIDC_CLIENT_SECRET,
            scopes: ["openid", "email", "profile"],
            pkce: true,
            requireIdTokenVerification: true,
          },
        ],
      }),
    ],
  });

const instances = new Map<string, ReturnType<typeof createAuth>>();

/**
 * Better Auth for requests arriving at this origin. The genericOAuth plugin
 * fetches the provider's discovery document when it starts, and Workers allow
 * no I/O at module scope, so instances are made on first use.
 */
export const authFor = (env: StudioApiEnv, origin: string) => {
  const existing = instances.get(origin);
  if (existing !== undefined) return existing;
  const auth = createAuth(env, origin);
  instances.set(origin, auth);
  return auth;
};
