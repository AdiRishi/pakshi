import { themeFonts } from "@repo/tokens/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [tailwindcss(), themeFonts(), react()],
  server: { port: 5199 },
});
