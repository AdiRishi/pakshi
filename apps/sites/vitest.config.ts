import { defineConfig } from "vitest/config";

// The app's own Vite config builds the Worker, which these tests of plain modules don't need.
export default defineConfig({});
