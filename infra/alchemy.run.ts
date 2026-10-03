import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

import { project } from "./src/project.ts";
import { Sites, Studio } from "./src/workers.ts";

export const Infrastructure = Effect.gen(function* () {
  const stack = yield* Alchemy.Stack;
  // Alchemy loads the stack under this stage for commands that never deploy it.
  if (stack.stage === "placeholder") return {};

  const sites = yield* Sites;
  const studio = yield* Studio(sites);

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
