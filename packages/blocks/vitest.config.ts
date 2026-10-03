import { themeFonts } from "@repo/tokens/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tailwindcss(), themeFonts(), viteReact()],
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
          exclude: ["tests/browser/**"],
        },
      },
      {
        test: {
          name: "browser",
          include: ["tests/browser/**/*.test.tsx"],
          // Files share one browser page and its single keyboard focus, so a
          // file's clicks and keys would land in another running beside it.
          fileParallelism: false,
          setupFiles: ["./tests/browser/setup.ts"],
          // Bundled before the first test, or Vite reloads the page mid-run when it finds them.
          deps: {
            optimizer: {
              client: {
                include: [
                  "@base-ui/react/accordion",
                  "@base-ui/react/dialog",
                  "@base-ui/react/navigation-menu",
                  "@tanstack/react-form",
                  "axe-core",
                  "embla-carousel-react",
                  "motion/react",
                  "react-dom/client",
                  "react-dom/server",
                ],
              },
            },
          },
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
