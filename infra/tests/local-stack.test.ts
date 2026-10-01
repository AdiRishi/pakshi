import * as Cloudflare from "alchemy/Cloudflare";
import * as Test from "alchemy/Test/Vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient } from "effect/unstable/http";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { expect } from "vitest";

import Stack from "../alchemy.run.ts";
import { waitForWorker } from "./support/worker-readiness.ts";

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
    Effect.tap(({ sitesUrl }) => waitForWorker(sitesUrl)),
  ),
  { timeout: 600_000 },
);
afterAll(destroy(Stack), { timeout: 600_000 });

const get = Effect.fn(function* (url: string) {
  const response = yield* HttpClient.get(url, { headers: { "cache-control": "no-cache" } });
  return { status: response.status, headers: response.headers, body: yield* response.text };
});

test(
  "sites serves the seeded snapshot at its own host",
  Effect.gen(function* () {
    const { sitesUrl } = yield* stack;
    const home = yield* get(sitesUrl);
    expect(home.status).toBe(200);
    expect(home.body).toContain("Learn by building");
    expect(home.body).toContain('data-surface="muted"');
    expect(home.body).toContain("prefers-color-scheme: dark");
    const programme = yield* get(`${sitesUrl}/programme`);
    expect(programme.body).toContain("Summer school at the harbour");
    expect(programme.body).toContain('href="/"');
  }),
);

test(
  "a second request for a page is served from the cache",
  Effect.gen(function* () {
    const { sitesUrl } = yield* stack;
    yield* get(`${sitesUrl}/programme`);
    const second = yield* get(`${sitesUrl}/programme`);
    expect(second.headers["x-pakshi-cache"]).toBe("hit");
    expect(second.headers["cache-control"]).toBe("public, max-age=0, must-revalidate");
  }),
);

test(
  "only reads are served from or stored in the page cache",
  Effect.gen(function* () {
    const { sitesUrl } = yield* stack;
    const posted = yield* Effect.promise(() => fetch(`${sitesUrl}/programme`, { method: "POST" }));
    expect(posted.headers.get("x-pakshi-cache")).toBeNull();
  }),
);

test(
  "removed addresses are gone and unknown ones are not found",
  Effect.gen(function* () {
    const { sitesUrl } = yield* stack;
    expect((yield* get(`${sitesUrl}/old-programme`)).status).toBe(410);
    expect((yield* get(`${sitesUrl}/no-such-page`)).status).toBe(404);
  }),
);

test(
  "media is served from R2 and cached for good",
  Effect.gen(function* () {
    const { sitesUrl } = yield* stack;
    const media = yield* get(`${sitesUrl}/_media/med_harbour`);
    expect(media.status).toBe(200);
    expect(media.headers["content-type"]).toBe("image/jpeg");
    expect(media.headers["cache-control"]).toContain("immutable");
    expect((yield* get(`${sitesUrl}/_media/med_missing`)).status).toBe(404);
  }),
);

test(
  "Studio sends people who aren't signed in to the sign-in page",
  Effect.gen(function* () {
    const { studioUrl } = yield* stack;
    yield* waitForWorker(`${studioUrl}/sign-in`);
    const response = yield* Effect.promise(() => fetch(studioUrl, { redirect: "manual" }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/sign-in");
  }),
);

test(
  "the browser suite passes against the deployed stack",
  Effect.gen(function* () {
    const { studioUrl, sitesUrl } = yield* stack;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const exitCode = yield* spawner.exitCode(
      ChildProcess.make("pnpm", ["exec", "playwright", "test"], {
        env: { STUDIO_URL: studioUrl, SITES_URL: sitesUrl },
        extendEnv: true,
        stdout: "inherit",
        stderr: "inherit",
      }),
    );
    expect(exitCode).toBe(0);
  }),
  { timeout: 300_000 },
);
