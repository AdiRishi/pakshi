import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Alchemy's Astro resource adds the Cloudflare adapter when it builds and
// serves this app, so the config must not declare one.
export default defineConfig({
  output: "server",
  devToolbar: { enabled: false },
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
