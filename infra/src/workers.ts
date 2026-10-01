import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";

import { agentGateway } from "./agent.ts";
import { workerCompatibility, workerObservability } from "./cloudflare-config.ts";
import { dataPlane } from "./data-plane.ts";
import { deploymentConfig, workerName } from "./deployment-config.ts";
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
    env: yield* sitesApiBindings(config.environment, yield* dataPlane),
  });
});

/** The sites Worker, whose host every site's platform subdomain goes under. */
type SitesWorker = Effect.Success<ReturnType<typeof Sites>>;

/** Domain logic, sign-in, the agent, and the SiteDoc and SiteAgent Durable Objects. */
export const StudioApi = Effect.fn("Pakshi.StudioApi")(function* (sites: SitesWorker) {
  const config = yield* deploymentConfig();
  const env = yield* studioApiBindings(
    config.environment,
    yield* dataPlane,
    yield* SitesApi,
    workerName("sites-api", config.stage),
    Output.map(sites.url, (url) => new URL(url ?? "").host),
    yield* agentGateway,
  );
  return yield* Cloudflare.Worker("StudioApi", {
    ...workerDefaults,
    name: workerName("studio-api", config.stage),
    main: "../workers/studio-api/src/index.ts",
    workersDev: false,
    // The reconcile job, which has each site's SiteDoc rewrite a KV entry that differs from D1.
    crons: ["*/5 * * * *"],
    env,
  });
});

/** What decides whether Studio is rebuilt: its own files and the workspace packages it imports. */
const studioMemo = {
  include: [
    "**/*",
    "../../packages/*/src/**",
    "../../packages/*/package.json",
    "../../tooling/tsconfig/**",
  ],
  lockfile: true,
};

/** Studio, the admin app. */
export const Studio = Effect.fn("Pakshi.Studio")(function* (sites: SitesWorker) {
  const config = yield* deploymentConfig();
  return yield* Cloudflare.Website.Vite("Studio", {
    ...workerDefaults,
    name: workerName("studio", config.stage),
    rootDir: "../apps/studio",
    workersDev: true,
    memo: studioMemo,
    env: studioBindings(config.environment, yield* StudioApi(sites)),
  });
});

/**
 * Every published site, rendered from snapshots.
 *
 * `rootDir` must be absolute: in dev, Alchemy starts Astro with the resolved
 * root as its working directory, then resolves a relative `rootDir` again from
 * there. Alchemy's Astro builder hashes only files under `rootDir`, and finds
 * the workspace packages Sites imports on its own.
 */
export const Sites = Effect.fn("Pakshi.Sites")(function* (rootDir: string) {
  const config = yield* deploymentConfig();
  return yield* Cloudflare.Website.Astro("Sites", {
    ...workerDefaults,
    name: workerName("sites", config.stage),
    rootDir,
    workersDev: true,
    sessionKVBindingName: false,
    memo: { include: ["**/*"], lockfile: true },
    env: sitesBindings(yield* dataPlane, yield* SitesApi),
  });
});
