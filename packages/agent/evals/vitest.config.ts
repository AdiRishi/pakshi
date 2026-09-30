import { defineConfig } from "vitest/config";

/*
 * The evals call the real model, so they run apart from the unit tests,
 * one task at a time, with room for slow turns.
 */
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ["**/*.eval.ts"],
    testTimeout: 30 * 60 * 1000,
    fileParallelism: false,
  },
});
