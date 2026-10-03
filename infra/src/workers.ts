import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";

import { schedules } from "../../workers/studio-api/src/schedules.ts";
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
type SitesWorker = Effect.Success<typeof Sites>;

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
    crons: Object.values(schedules),
    env,
  });
});

/** What decides whether an app is rebuilt: its own files and the workspace packages it imports. */
const appMemo = {
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
    memo: appMemo,
    env: studioBindings(config.environment, yield* StudioApi(sites)),
  });
});

/** Every published site, rendered from snapshots. */
export const Sites = Effect.gen(function* () {
  const config = yield* deploymentConfig();
  return yield* Cloudflare.Website.Vite("Sites", {
    ...workerDefaults,
    name: workerName("sites", config.stage),
    rootDir: "../apps/sites",
    workersDev: true,
    memo: appMemo,
    env: sitesBindings(yield* dataPlane, yield* SitesApi),
  });
});
