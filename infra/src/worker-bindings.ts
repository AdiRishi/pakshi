import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import type * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import type * as Redacted from "effect/Redacted";

import type { SiteSubmissions } from "../../workers/sites-api/src/index.ts";
import type { SiteAgent, SiteDoc } from "../../workers/studio-api/src/index.ts";
import type { DataPlane } from "./data-plane.ts";
import type { DeploymentConfig } from "./deployment-config.ts";
import type { IdentityProvider } from "./identity.ts";
import type { SitesApi, StudioApi } from "./workers.ts";

export const testIdentityProviderBindings = (keys: {
  readonly signingKey: Output.Output<Redacted.Redacted<string>>;
  readonly clientId: string;
  readonly clientSecret: Output.Output<Redacted.Redacted<string>>;
}) => ({
  SIGNING_KEY: keys.signingKey,
  CLIENT_ID: keys.clientId,
  CLIENT_SECRET: keys.clientSecret,
});
export interface TestIdentityProviderEnv extends Cloudflare.InferEnv<
  ReturnType<typeof testIdentityProviderBindings>
> {}

export const sitesApiBindings = (environment: DeploymentConfig["environment"]) => ({
  SITE_SUBMISSIONS: Cloudflare.DurableObject<SiteSubmissions>("SiteSubmissions"),
  ENVIRONMENT: environment,
});
export interface SitesApiEnv extends Cloudflare.InferEnv<ReturnType<typeof sitesApiBindings>> {}

export const studioApiBindings = Effect.fn("Pakshi.StudioApiBindings")(function* (
  environment: DeploymentConfig["environment"],
  data: DataPlane,
  sitesApiName: string,
  identity: IdentityProvider,
) {
  const authSecret = yield* Alchemy.makeRandom("AuthSecret");
  return {
    // A Durable Object's data is keyed by its binding name here. Renaming one
    // deletes the class and everything it stored.
    SITE_DOC: Cloudflare.DurableObject<SiteDoc>("SiteDoc"),
    SITE_AGENT: Cloudflare.DurableObject<SiteAgent>("SiteAgent"),
    SITE_SUBMISSIONS: Cloudflare.DurableObject<SiteSubmissions>("SiteSubmissions", {
      scriptName: sitesApiName,
    }),
    CORE: data.core,
    CONTENT: data.content,
    ROUTING: data.routing,
    ENVIRONMENT: environment,
    AUTH_SECRET: authSecret,
    OIDC_DISCOVERY_URL: identity.discoveryUrl,
    OIDC_CLIENT_ID: identity.clientId,
    OIDC_CLIENT_SECRET: identity.clientSecret,
  };
});
export interface StudioApiEnv extends Cloudflare.InferEnv<
  Effect.Success<ReturnType<typeof studioApiBindings>>
> {}

export const studioBindings = (
  environment: DeploymentConfig["environment"],
  studioApi: Effect.Success<typeof StudioApi>,
  identity: IdentityProvider,
) => ({
  /** Sign-in, forwarded as plain HTTP. */
  STUDIO_API: studioApi,
  /** Everything else, as the StudioRpcs contract in @repo/contracts/studio. */
  STUDIO_RPC: Cloudflare.WorkerEntrypoint(studioApi, "StudioRpc"),
  ENVIRONMENT: environment,
  ORGANIZATION_NAME: identity.organizationName,
});
export interface StudioEnv extends Cloudflare.InferEnv<ReturnType<typeof studioBindings>> {}

export const sitesBindings = (data: DataPlane, sitesApi: Effect.Success<typeof SitesApi>) => ({
  ROUTING: data.routing,
  CONTENT: data.content,
  SITES_API: sitesApi,
  CF_VERSION_METADATA: Cloudflare.Workers.VersionMetadata(),
});
export interface SitesEnv extends Cloudflare.InferEnv<ReturnType<typeof sitesBindings>> {}
