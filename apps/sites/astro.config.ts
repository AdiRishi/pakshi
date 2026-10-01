import react from "@astrojs/react";
import { themeFonts } from "@repo/tokens/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Alchemy's Astro resource adds the Cloudflare adapter when it builds and
// serves this app, so the config must not declare one.
export default defineConfig({
  output: "server",
  devToolbar: { enabled: false },
  // Each page's policy lets it load only the site's own styles, fonts and
  // images, plus what it inlines, by hash. Pages run no scripts. Astro's dev
  // server injects its own, so the policy is sent only by built sites.
  security: {
    csp: {
      directives: [
        "default-src 'none'",
        "img-src 'self'",
        "font-src 'self'",
        "form-action 'self'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
      ],
    },
  },
  integrations: [react()],
  vite: { plugins: [tailwindcss(), themeFonts()] },
});
