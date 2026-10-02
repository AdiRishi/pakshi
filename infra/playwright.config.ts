import { defineConfig } from "@playwright/test";

import { screenshotTolerance } from "./tests/support/screenshot-tolerance.ts";

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
  // Baselines are named for their test file and platform, whichever project runs them.
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}-{platform}{ext}",
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 60_000, toHaveScreenshot: screenshotTolerance },
  reporter: "list",
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 800 },
    // Sections fade in on scroll with a theme's motion on, which a full-page screenshot would catch half done.
    reducedMotion: "reduce",
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
