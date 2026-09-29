import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

import { bucketLifecycleRules } from "./cloudflare-config.ts";

/**
 * The stores every stage shares. Destroying a stage deletes them with
 * everything in them, the bucket included.
 */
export const dataPlane = Effect.gen(function* () {
  const core = yield* Cloudflare.D1.Database("Core", {
    migrations: "../workers/studio-api/migrations",
  });
  const content = yield* Cloudflare.R2.Bucket("Content", {
    forceDestroy: true,
    lifecycleRules: [...bucketLifecycleRules],
  });
  const routing = yield* Cloudflare.KV.Namespace("Routing");
  return { core, content, routing };
});

export type DataPlane = Effect.Success<typeof dataPlane>;
