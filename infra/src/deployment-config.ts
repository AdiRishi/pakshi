import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Function from "effect/Function";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";

type Environment = "local" | "production" | "test";

/** The two stacks: local development and production. Test suites deploy throwaway local stages. */
const stages = {
  dev: "local",
  prod: "production",
} as const satisfies Record<string, Environment>;

const TestStage = Schema.TemplateLiteral([
  "test-",
  Schema.String.check(Schema.isPattern(/^[a-f0-9]{8}$/u)),
]);
export const Stage = Schema.Union([Schema.Literals(Record.keys(stages)), TestStage]);
export type Stage = typeof Stage.Type;

export const decodeStage = Function.flow(
  Schema.decodeUnknownEffect(Stage),
  Effect.mapError((error) => new Config.ConfigError(error)),
);

export const stageEnvironment = (stage: Stage): Environment =>
  Object.entries(stages).find(([name]) => name === stage)?.[1] ?? "test";

export const deploymentConfig = Effect.fn("Pakshi.DeploymentConfig")(function* () {
  const stack = yield* Alchemy.Stack;
  const stage = yield* decodeStage(stack.stage);
  const environment = stageEnvironment(stage);
  return { stage, environment, production: environment === "production" };
});

export type DeploymentConfig = Effect.Success<ReturnType<typeof deploymentConfig>>;

/**
 * Every Worker's name in Cloudflare, such as `pakshi-studio-api-prod`. Names
 * are fixed rather than generated so they read clearly in the dashboard, and
 * because Alchemy replaces a Worker whose name changes, which deletes the data
 * of any Durable Objects it hosts.
 */
export const workerName = (worker: string, stage: Stage) => `pakshi-${worker}-${stage}`;
