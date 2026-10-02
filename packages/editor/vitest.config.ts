import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tailwindcss(), viteReact()],
  test: {
    projects: [
      {
        test: { name: "unit", environment: "node", include: ["tests/**/*.test.ts"] },
      },
      {
        plugins: [tailwindcss(), viteReact()],
        test: {
          name: "browser",
          include: ["tests/**/*.test.tsx"],
          setupFiles: ["./tests/setup.ts"],
          // Files share one browser page and its single keyboard focus, so a
          // file's clicks and keys would land in another running beside it.
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
