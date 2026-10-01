import { join } from "node:path";

import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

import { deploymentConfig } from "./src/deployment-config.ts";
import { project } from "./src/project.ts";
import { seedTestData } from "./src/seed.ts";
import { Sites, Studio } from "./src/workers.ts";

export const Infrastructure = Effect.gen(function* () {
  const stack = yield* Alchemy.Stack;
  // Alchemy loads the stack under this stage for commands that never deploy it.
  if (stack.stage === "placeholder") return {};

  const config = yield* deploymentConfig();
  const sites = yield* Sites(join(import.meta.dirname, "../apps/sites"));
  const studio = yield* Studio(sites);
  // Test stages get the block fixture sites the browser suite compares renderers on.
  if (config.environment === "test") yield* seedTestData(sites);

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
