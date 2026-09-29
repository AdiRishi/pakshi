import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Function from "effect/Function";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";

type Environment = "local" | "staging" | "production" | "test";

const stages = {
  dev: "local",
  staging: "staging",
  prod: "production",
} as const satisfies Record<string, Environment>;

const TestStage = Schema.TemplateLiteral([
  "test-",
  Schema.String.check(Schema.isPattern(/^[a-f0-9]{8}$/)),
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
