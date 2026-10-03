import { defineConfig } from "@playwright/test";

const studioUrl = process.env.STUDIO_URL;
const sitesUrl = process.env.SITES_URL;
if (!studioUrl || !sitesUrl) {
  throw new Error("Run pnpm --filter @repo/infra test so Alchemy supplies the application URLs.");
}

/*
 * Integration journeys against one local stack. The setup project sets the
 * empty stack up through Studio, as its first person would, and every journey
 * starts from that organization.
 */
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 60_000 },
  reporter: "list",
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: "set-up.integration.test.ts" },
    {
      name: "journeys",
      testMatch: "*.integration.test.ts",
      testIgnore: "set-up.integration.test.ts",
      dependencies: ["setup"],
    },
  ],
});
