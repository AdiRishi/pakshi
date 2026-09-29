import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({ basePath: "/api/auth" });

/** The ID studio-api gives the organization's identity provider. */
export const identityProviderId = "organization";
