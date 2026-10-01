import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { workerCompatibility } from "@repo/infra/cloudflare-config";
import {
  miniflareBindings,
  sitesApiTestBindings,
  studioApiTestBindings,
  testWorkers,
} from "@repo/infra/test-bindings";
import { build } from "esbuild";
import { defineConfig } from "vitest/config";

const outdir = join(import.meta.dirname, "node_modules/.e2e");

/** Bundles a Worker that runs beside studio-api in E2E tests, since Miniflare runs JavaScript. */
const bundle = async (name: string, entry: string) => {
  const outfile = join(outdir, `${name}.mjs`);
  await build({
    entryPoints: [join(import.meta.dirname, entry)],
    outfile,
    bundle: true,
    format: "esm",
    platform: "neutral",
    conditions: ["workerd", "worker"],
    external: ["cloudflare:*", "node:*"],
    logLevel: "error",
  });
  return outfile;
};

const compatibility = { compatibilityDate: workerCompatibility.date };

const studioApi = miniflareBindings(studioApiTestBindings);

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/e2e/**"],
        },
      },
      {
        plugins: [
          cloudflareTest(async () => {
            await mkdir(outdir, { recursive: true });
            const [sitesApi, mailbox, workersAi] = await Promise.all([
              bundle(testWorkers.sitesApi, "../sites-api/src/index.ts"),
              bundle(testWorkers.mailbox, "tests/e2e/support/mailbox.ts"),
              bundle(testWorkers.workersAi, "tests/e2e/support/workers-ai.ts"),
            ]);
            return {
              main: "./src/index.ts",
              miniflare: {
                ...compatibility,
                ...studioApi,
                bindings: {
                  ...studioApi.bindings,
                  TEST_MIGRATIONS: await readD1Migrations(join(import.meta.dirname, "migrations")),
                },
                serviceBindings: {
                  ...studioApi.serviceBindings,
                  MAILBOX: { name: testWorkers.mailbox, entrypoint: "Mailbox" },
                },
                workers: [
                  {
                    name: testWorkers.sitesApi,
                    modules: true,
                    scriptPath: sitesApi,
                    ...compatibility,
                    ...miniflareBindings(sitesApiTestBindings),
                  },
                  {
                    name: testWorkers.mailbox,
                    modules: true,
                    scriptPath: mailbox,
                    ...compatibility,
                    durableObjects: { MESSAGES: { className: "Messages", useSQLite: true } },
                  },
                  {
                    name: testWorkers.workersAi,
                    modules: true,
                    scriptPath: workersAi,
                    ...compatibility,
                  },
                ],
              },
            };
          }),
        ],
        test: {
          name: "e2e",
          include: ["tests/e2e/**/*.e2e.test.ts"],
          setupFiles: ["tests/e2e/support/setup.ts"],
        },
      },
    ],
  },
});
