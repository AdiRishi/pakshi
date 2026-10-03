import * as Cloudflare from "alchemy/Cloudflare";
import * as Test from "alchemy/Test/Vitest";
import * as Effect from "effect/Effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import * as Schema from "effect/Schema";
import { expect } from "vitest";

import Stack from "../alchemy.run.ts";
import { waitForWorker } from "./support/worker-readiness.ts";

/*
 * Deploys a throwaway local stack, then runs the integration journeys in
 * `*.integration.test.ts` against it with Playwright. The stack starts empty.
 */

const { test, beforeAll, afterAll, deploy, destroy } = Test.make({
  providers: Cloudflare.providers(),
  stage: `test-${crypto.randomUUID().slice(0, 8)}`,
  dev: true,
});

const stack = beforeAll(
  deploy(Stack).pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(
        Schema.Struct({ studioUrl: Schema.String, sitesUrl: Schema.String }),
      ),
    ),
    Effect.tap(({ studioUrl }) => waitForWorker(`${studioUrl}/set-up`)),
  ),
  { timeout: 600_000 },
);
afterAll(destroy(Stack), { timeout: 600_000 });

test(
  "the integration journeys pass against the deployed stack",
  Effect.gen(function* () {
    const { studioUrl, sitesUrl } = yield* stack;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    // JOURNEYS="blocks forms" runs only the journeys whose file names match.
    const journeys = process.env.JOURNEYS?.split(/\s+/).filter(Boolean) ?? [];
    const exitCode = yield* spawner.exitCode(
      ChildProcess.make("pnpm", ["exec", "playwright", "test", ...journeys], {
        env: { STUDIO_URL: studioUrl, SITES_URL: sitesUrl },
        extendEnv: true,
        stdout: "inherit",
        stderr: "inherit",
      }),
    );
    expect(exitCode).toBe(0);
  }),
  { timeout: 1_800_000 },
);
