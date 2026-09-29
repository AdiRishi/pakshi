import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

import { workerCompatibility, workerObservability } from "./cloudflare-config.ts";
import { deploymentConfig, workerName } from "./deployment-config.ts";
import { testIdentityProviderBindings } from "./worker-bindings.ts";

const testClientId = "pakshi-studio";

/**
 * The OpenID Connect provider staff sign in with. Production reads the
 * organization's provider from configuration; every other stage deploys the
 * test provider and signs in its test users.
 */
export const identityProvider = Effect.gen(function* () {
  const { production, stage } = yield* deploymentConfig();
  if (production) {
    return {
      organizationName: Config.String("ORGANIZATION_NAME"),
      discoveryUrl: Config.String("OIDC_DISCOVERY_URL"),
      clientId: Config.String("OIDC_CLIENT_ID"),
      clientSecret: Config.Redacted("OIDC_CLIENT_SECRET"),
    };
  }
  const clientSecret = yield* Alchemy.makeRandom("TestIdentityClientSecret");
  const signingKey = yield* Alchemy.KeyPair("TestIdentitySigningKey", { algorithm: "ec" });
  const provider = yield* Cloudflare.Worker("TestIdentityProvider", {
    name: workerName("test-identity-provider", stage),
    main: "../workers/test-identity-provider/src/index.ts",
    compatibility: workerCompatibility,
    observability: workerObservability,
    env: testIdentityProviderBindings({
      signingKey: signingKey.privateKey,
      clientId: testClientId,
      clientSecret,
    }),
  });
  return {
    organizationName: "Pakshi test",
    discoveryUrl: Output.interpolate`${provider.url}/.well-known/openid-configuration`,
    clientId: testClientId,
    clientSecret,
  };
});

export type IdentityProvider = Effect.Success<typeof identityProvider>;
