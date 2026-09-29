import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

import { workerCompatibility, workerObservability } from "./cloudflare-config.ts";
import { dataPlane } from "./data-plane.ts";
import { deploymentConfig, workerName } from "./deployment-config.ts";
import { identityProvider } from "./identity.ts";
import {
  sitesApiBindings,
  sitesBindings,
  studioApiBindings,
  studioBindings,
} from "./worker-bindings.ts";

const workerDefaults = {
  compatibility: workerCompatibility,
  observability: workerObservability,
};

/** Form intake, and the SiteSubmissions Durable Objects. */
export const SitesApi = Effect.gen(function* () {
  const config = yield* deploymentConfig();
  return yield* Cloudflare.Worker("SitesApi", {
    ...workerDefaults,
    name: workerName("sites-api", config.stage),
    workersDev: false,
    main: "../workers/sites-api/src/index.ts",
    env: sitesApiBindings(config.environment),
  });
});

/** Domain logic, sign-in, and the SiteDoc and SiteAgent Durable Objects. */
export const StudioApi = Effect.gen(function* () {
  const config = yield* deploymentConfig();
  yield* SitesApi;
  const env = yield* studioApiBindings(
    config.environment,
    yield* dataPlane,
    workerName("sites-api", config.stage),
    yield* identityProvider,
  );
  return yield* Cloudflare.Worker("StudioApi", {
    ...workerDefaults,
    name: workerName("studio-api", config.stage),
    main: "../workers/studio-api/src/index.ts",
    workersDev: false,
    env,
  });
});

const memo = (...paths: ReadonlyArray<string>) => ({
  include: [
    "**/*",
    "../../packages/*/src/**",
    "../../packages/*/package.json",
    "../../tooling/tsconfig/**",
    ...paths,
  ],
  lockfile: true,
});

/** Studio, the admin app. */
export const Studio = Effect.gen(function* () {
  const config = yield* deploymentConfig();
  return yield* Cloudflare.Website.Vite("Studio", {
    ...workerDefaults,
    name: workerName("studio", config.stage),
    rootDir: "../apps/studio",
    main: "src/worker.ts",
    workersDev: true,
    memo: memo(),
    env: studioBindings(config.environment, yield* StudioApi, yield* identityProvider),
  });
});

/**
 * Every published site and preview, rendered from snapshots. Astro's dev
 * server resolves a relative root from its own working directory, so the
 * stack passes an absolute one.
 */
export const Sites = Effect.fn("Pakshi.Sites")(function* (rootDir: string) {
  const config = yield* deploymentConfig();
  return yield* Cloudflare.Website.Astro("Sites", {
    ...workerDefaults,
    name: workerName("sites", config.stage),
    rootDir,
    workersDev: true,
    sessionKVBindingName: false,
    memo: memo(),
    env: sitesBindings(yield* dataPlane, yield* SitesApi),
  });
});
