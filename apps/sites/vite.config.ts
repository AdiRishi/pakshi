import { themeFonts } from "@repo/tokens/vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  environments: {
    ssr: {
      build: {
        rolldownOptions: {
          // Alchemy supplies this module in the Worker runtime. Standalone CI
          // builds must leave it unresolved. Only the server build may import it.
          external: ["cloudflare:workers"],
        },
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tailwindcss(), themeFonts(), tanstackStart(), viteReact()],
});
