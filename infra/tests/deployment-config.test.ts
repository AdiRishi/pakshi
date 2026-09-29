import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decodeStage, stageEnvironment, workerName } from "../src/deployment-config.ts";

it.effect("accepts the supported deployment stages", () =>
  Effect.gen(function* () {
    expect(yield* decodeStage("dev")).toBe("dev");
    expect(yield* decodeStage("prod")).toBe("prod");
    expect(yield* decodeStage("test-deadbeef")).toBe("test-deadbeef");
    expect(stageEnvironment("prod")).toBe("production");
    expect(stageEnvironment("test-deadbeef")).toBe("test");
  }),
);

it.effect("rejects unsupported deployment stages", () =>
  Effect.gen(function* () {
    for (const stage of ["staging", "production", "test", "test-local", "test-123"]) {
      const invalid = yield* Effect.flip(decodeStage(stage));
      expect(invalid._tag).toBe("ConfigError");
    }
  }),
);

it("names production's Workers the same way on every deploy", () => {
  expect(
    ["studio", "studio-api", "sites", "sites-api"].map((worker) => workerName(worker, "prod")),
  ).toEqual([
    "pakshi-studio-prod",
    "pakshi-studio-api-prod",
    "pakshi-sites-prod",
    "pakshi-sites-api-prod",
  ]);
});
