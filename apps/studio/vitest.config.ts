import { themeFonts } from "@repo/tokens/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import type { BrowserCommand } from "vitest/node";

/** Switches the browser's color scheme, as someone changing their system's setting would. */
const emulateColorScheme: BrowserCommand<[scheme: "light" | "dark"]> = ({ page }, scheme) =>
  page.emulateMedia({ colorScheme: scheme });

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tailwindcss(), themeFonts(), viteReact()],
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "components",
          include: ["tests/**/*.test.tsx"],
          setupFiles: ["./tests/setup.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
            commands: { emulateColorScheme },
          },
        },
      },
    ],
  },
});
