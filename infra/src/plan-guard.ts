import { Predicate, Schema } from "effect";

/** The parts of an Alchemy plan node the guard reads. Alchemy's own plan nodes fit this. */
export interface PlannedNode {
  readonly action: string;
  readonly resource: { readonly Type: string; readonly FQN: string };
  readonly props?: unknown;
  readonly state?: { readonly props?: unknown } | undefined;
}

export interface PlanView {
  readonly resources: Readonly<Record<string, PlannedNode>>;
  readonly deletions: Readonly<Record<string, PlannedNode | undefined>>;
}

const storesData = new Set(["Cloudflare.D1Database", "Cloudflare.R2.Bucket"]);

const WorkerProps = Schema.Struct({
  env: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});

const HostedDurableObject = Schema.Struct({
  kind: Schema.Literal("Cloudflare.DurableObject"),
  className: Schema.String,
  scriptName: Schema.optional(Schema.Undefined),
});

/**
 * The Durable Object classes a Worker hosts, by binding name. Alchemy keys a
 * class's migrations by its binding name, so a binding that disappears deletes
 * the class and its data. Bindings to another Worker's classes carry a
 * `scriptName` and aren't hosted here.
 */
const hostedClasses = (props: PlannedNode["props"]) => {
  const env = Schema.decodeUnknownOption(WorkerProps)(props);
  const hosted = new Map<string, string>();
  if (env._tag === "None") return hosted;
  for (const [binding, value] of Object.entries(env.value.env ?? {})) {
    const durableObject = Schema.decodeUnknownOption(HostedDurableObject)(value);
    if (durableObject._tag === "Some") hosted.set(binding, durableObject.value.className);
  }
  return hosted;
};

/**
 * What a plan would destroy that can't be brought back: a D1 database or an R2
 * bucket deleted or replaced, or a Durable Object class removed from, or
 * replaced with, its Worker. A retained resource is planned as `orphaned`, so
 * it passes.
 */
export const destructiveChanges = (plan: PlanView) => {
  const problems: Array<string> = [];
  const nodes = [
    ...Object.values(plan.resources),
    ...Object.values(plan.deletions).filter(Predicate.isNotUndefined),
  ];
  for (const node of nodes) {
    const { Type: type, FQN: name } = node.resource;
    if ((node.action === "delete" || node.action === "replace") && storesData.has(type))
      problems.push(`${node.action} ${type} ${name}`);
    if (type !== "Cloudflare.Worker" || node.action === "orphaned") continue;
    const kept =
      node.action === "delete" || node.action === "replace" ? new Map() : hostedClasses(node.props);
    for (const [binding, className] of hostedClasses(node.state?.props)) {
      if (!kept.has(binding))
        problems.push(
          `${node.action === "noop" ? "update" : node.action} ${name} deletes the Durable Object class ${className} (${binding})`,
        );
    }
  }
  return problems;
};
