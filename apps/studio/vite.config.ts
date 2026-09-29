import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const config = defineConfig({
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
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
});

export default config;
