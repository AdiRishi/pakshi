import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

import { bucketLifecycleRules } from "./cloudflare-config.ts";
import { deploymentConfig } from "./deployment-config.ts";

/**
 * The stores every stage shares. Production retains them when they leave the
 * stack, so removing one from the graph never deletes its data.
 */
export const dataPlane = Effect.gen(function* () {
  const { production } = yield* deploymentConfig();
  const retain = Alchemy.RemovalPolicy.retain(production);
  const core = yield* Cloudflare.D1.Database("Core", {
    migrations: "../workers/studio-api/migrations",
  }).pipe(retain);
  const content = yield* Cloudflare.R2.Bucket("Content", {
    lifecycleRules: [...bucketLifecycleRules],
  }).pipe(retain);
  const routing = yield* Cloudflare.KV.Namespace("Routing").pipe(retain);
  return { core, content, routing };
});

export type DataPlane = Effect.Success<typeof dataPlane>;
