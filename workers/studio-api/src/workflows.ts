import type { Scope } from "@repo/contracts/access";
import type { BrandId, SiteId } from "@repo/contracts/ids";
import {
  NotPermitted,
  type Person,
  type ResolvedWorkflow,
  ScopeNotFound,
} from "@repo/contracts/studio";
import { Workflow } from "@repo/contracts/workflow";
import { authorize, permissionsOn } from "@repo/domain/access";
import { Effect, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

import { describeScope, loadAccess } from "./access.ts";

/*
 * Approval workflows, as rows in D1. Each scope may set its own; one that
 * doesn't uses the workflow of the scope above it: a site its brand's, a
 * brand the organization's.
 */

const StepsRow = Schema.Struct({ steps: Schema.fromJsonString(Workflow) });
const encodeSteps = Schema.encodeSync(Schema.fromJsonString(Workflow));

const scopeId = (scope: Scope) => (scope.kind === "organization" ? null : scope.id);

/** A scope's own workflow, or none when it uses the one above it. */
const ownSteps = Effect.fn("StudioApi.ownSteps")(function* (scope: Scope) {
  const sql = yield* SqlClient.SqlClient;
  const row = yield* SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: StepsRow,
    execute: () => sql`select steps from workflows
      where scope_kind = ${scope.kind} and coalesce(scope_id, '') = ${scopeId(scope) ?? ""}`,
  })(undefined);
  return Option.map(row, ({ steps }) => steps);
});

/** The first workflow set on the scopes given, nearest first. */
const nearest = Effect.fn("StudioApi.nearestWorkflow")(function* (scopes: ReadonlyArray<Scope>) {
  for (const scope of scopes) {
    const steps = yield* ownSteps(scope);
    if (Option.isSome(steps))
      return { steps: steps.value, from: scope.kind } satisfies ResolvedWorkflow;
  }
  return { steps: [], from: null } satisfies ResolvedWorkflow;
});

const above = (scope: Scope, brand: BrandId | null): ReadonlyArray<Scope> => {
  switch (scope.kind) {
    case "organization":
      return [];
    case "brand":
      return [{ kind: "organization" }];
    case "site":
      return brand === null
        ? [{ kind: "organization" }]
        : [{ kind: "brand", id: brand }, { kind: "organization" }];
  }
};

/** The workflow a site's submissions go through. */
export const siteWorkflow = (site: { readonly id: SiteId; readonly brand: BrandId }) =>
  nearest([{ kind: "site", id: site.id }, ...above({ kind: "site", id: site.id }, site.brand)]);

/**
 * A scope's workflow as the workflow editor shows it, for someone who holds
 * any permission there. Anyone else is told the scope doesn't exist.
 */
export const workflowView = Effect.fn("StudioApi.workflowView")(function* (
  person: Person,
  scope: Scope,
) {
  const described = yield* describeScope(scope);
  const { access } = yield* loadAccess(person.id);
  if (permissionsOn(access, described.resource).length === 0) return yield* new ScopeNotFound({});
  return {
    scope,
    name: described.name,
    own: Option.getOrNull(yield* ownSteps(scope)),
    parent: above(scope, described.brand)[0] ?? null,
    inherited: yield* nearest(above(scope, described.brand)),
    can: { edit: authorize(access, "workflow.edit", described.resource) },
  };
});

/** Sets a scope's own workflow, or with null, has it use the one above it. Needs `workflow.edit` there. */
export const saveWorkflow = Effect.fn("StudioApi.saveWorkflow")(function* (
  person: Person,
  scope: Scope,
  steps: Workflow | null,
) {
  const sql = yield* SqlClient.SqlClient;
  if (!(yield* workflowView(person, scope)).can.edit)
    return yield* new NotPermitted({ action: "edit this approval workflow" });
  if (steps === null)
    yield* sql`delete from workflows
      where scope_kind = ${scope.kind} and coalesce(scope_id, '') = ${scopeId(scope) ?? ""}`;
  else
    yield* sql`insert or replace into workflows (scope_kind, scope_id, steps, updated_at)
      values (${scope.kind}, ${scopeId(scope)}, ${encodeSteps(steps)}, ${new Date().toISOString()})`;
  return yield* workflowView(person, scope);
});
