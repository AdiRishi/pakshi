import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

import { deploymentConfig } from "./src/deployment-config.ts";
import { project } from "./src/project.ts";
import { seedTestData } from "./src/seed.ts";
import { Sites, Studio } from "./src/workers.ts";

export const Infrastructure = Effect.gen(function* () {
  const stack = yield* Alchemy.Stack;
  if (stack.stage === "placeholder") return {};

  const config = yield* deploymentConfig();
  const studio = yield* Studio;
  const sites = yield* Sites(new URL("../apps/sites", import.meta.url).pathname);
  if (!config.production) yield* seedTestData(sites);

  return {
    studioUrl: studio.url.as<string>(),
    sitesUrl: sites.url.as<string>(),
  };
});

export default Alchemy.Stack(
  project.stackName,
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Infrastructure,
);
