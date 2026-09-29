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
