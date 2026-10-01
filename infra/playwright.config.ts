import { defineConfig } from "@playwright/test";

const studioUrl = process.env.STUDIO_URL;
const sitesUrl = process.env.SITES_URL;
if (!studioUrl || !sitesUrl) {
  throw new Error("Run pnpm --filter @repo/infra test so Alchemy supplies the application URLs.");
}

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.browser.test.ts",
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 60_000, toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
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
});
