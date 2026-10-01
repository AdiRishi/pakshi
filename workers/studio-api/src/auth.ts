import { authBasePath, passwordLength } from "@repo/contracts/accounts";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

const createAuth = (env: StudioApiEnv, origin: string) =>
  betterAuth({
    database: env.CORE,
    secret: env.AUTH_SECRET,
    // Studio forwards requests unchanged, so the origin is the one the browser
    // sees, and cookies belong to Studio's host.
    baseURL: `${origin}${authBasePath}`,
    basePath: authBasePath,
    trustedOrigins: [origin],
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: passwordLength.min,
      maxPasswordLength: passwordLength.max,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await env.EMAIL.send({
          from: env.EMAIL_SENDER,
          to: user.email,
          subject: "Reset your Pakshi password",
          text: `Hello ${user.name},\n\nSomeone asked to reset the password for your Pakshi account. If it was you, choose a new password here:\n\n${url}\n\nThe link works for one hour. If you didn't ask, you can ignore this email.\n`,
        });
      },
    },
    hooks: {
      // Accounts are made only by setting up the organization or accepting an
      // invitation, which call sign-up from inside studio-api.
      before: createAuthMiddleware(async (context) => {
        if (context.path === "/sign-up/email" && context.request !== undefined)
          throw new APIError("NOT_FOUND");
      }),
    },
  });

const instances = new Map<string, ReturnType<typeof createAuth>>();

/** Better Auth for requests arriving at this origin, made on first use. */
export const authFor = (env: StudioApiEnv, origin: string) => {
  const existing = instances.get(origin);
  if (existing !== undefined) return existing;
  const auth = createAuth(env, origin);
  instances.set(origin, auth);
  return auth;
};
