import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

import { deploymentConfig } from "./deployment-config.ts";

/**
 * The AI Gateway every model call goes through. It logs each call with its
 * cost, tagged by brand, site and person, and holds the one spend limit for
 * the whole product: past it, the gateway refuses calls and the agent says
 * it can't help for now.
 */
export const agentGateway = Effect.gen(function* () {
  const config = yield* deploymentConfig();
  return yield* Cloudflare.AI.Gateway("AgentGateway", {
    collectLogs: true,
    cacheTtl: null,
    spendLimits: {
      enabled: true,
      // In cents, per rolling day.
      rules: [{ limitType: "cost", limit: config.production ? 50_00 : 5_00, window: "1 day" }],
    },
  });
});
