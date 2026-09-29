import * as Alchemist from "alchemy/Alchemist";
import * as Effect from "effect/Effect";

import { destructiveChanges } from "../src/plan-guard.ts";

/**
 * Plans a deploy (production unless another stage is named) and fails if it
 * would delete durable data. CI runs it before anything reaches production.
 */
const stage = process.argv[2] ?? "prod";
const problems = await Effect.runPromise(
  // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context -- Alchemist's plan leaves its error channel untyped.
  Alchemist.Stack.plan({
    target: { entrypoint: "alchemy.run.ts", stage },
    operation: "deploy",
  }).pipe(
    Effect.map((planned) => destructiveChanges(planned.native)),
    Effect.orDie,
    Effect.provide(Alchemist.layer()),
    Effect.scoped,
  ),
);

if (problems.length > 0) {
  console.error(
    `The ${stage} plan would destroy data:\n${problems.map((p) => `- ${p}`).join("\n")}`,
  );
  process.exit(1);
}
console.log(`The ${stage} plan deletes no D1 database, R2 bucket or Durable Object class.`);
