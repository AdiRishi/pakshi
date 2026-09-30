import { expect, it } from "@effect/vitest";
import { BrandId, SiteId } from "@repo/contracts/ids";
import type { Workflow } from "@repo/contracts/workflow";
import { Effect } from "effect";

import { saveWorkflow, siteWorkflow, workflowView } from "../src/workflows.ts";
import { core } from "./support/core.ts";

const person = (id: string) => ({ id, name: id, email: `${id}@pakshi.test` });

const oneStep = (name: string): Workflow => [
  { name, roles: ["approver"], people: [], required: 1 },
];

const northbank = { id: SiteId.make("site_a1"), brand: BrandId.make("brand_a") };

it.effect("a site uses its own workflow, else its brand's, else the organization's", () =>
  Effect.gen(function* () {
    expect(yield* siteWorkflow(northbank)).toEqual({ steps: [], from: null });
    yield* saveWorkflow(person("user_org"), { kind: "organization" }, oneStep("Web team"));
    expect(yield* siteWorkflow(northbank)).toEqual({
      steps: oneStep("Web team"),
      from: "organization",
    });
    yield* saveWorkflow(
      person("user_brand"),
      { kind: "brand", id: northbank.brand },
      oneStep("Libraries"),
    );
    expect((yield* siteWorkflow(northbank)).from).toBe("brand");
    // A site can set a workflow with no steps, so its changes publish without approval.
    yield* saveWorkflow(person("user_brand"), { kind: "site", id: northbank.id }, []);
    expect(yield* siteWorkflow(northbank)).toEqual({ steps: [], from: "site" });
    const view = yield* saveWorkflow(
      person("user_brand"),
      { kind: "site", id: northbank.id },
      null,
    );
    expect(view).toMatchObject({
      own: null,
      inherited: { steps: oneStep("Libraries"), from: "brand" },
    });
    expect((yield* siteWorkflow(northbank)).from).toBe("brand");
  }).pipe(Effect.provide(core)),
);

it.effect("changing a workflow needs the permission to edit workflows there", () =>
  Effect.gen(function* () {
    const scope = { kind: "site", id: SiteId.make("site_a2") } as const;
    expect((yield* workflowView(person("user_editor"), scope)).can.edit).toBe(false);
    const refused = yield* Effect.flip(saveWorkflow(person("user_editor"), scope, oneStep("Us")));
    expect(refused._tag).toBe("NotPermitted");
    expect((yield* workflowView(person("user_editor"), scope)).own).toBeNull();
  }).pipe(Effect.provide(core)),
);

it.effect("a scope the person holds nothing on looks like one that doesn't exist", () =>
  Effect.gen(function* () {
    const hidden = yield* Effect.flip(
      workflowView(person("user_editor"), { kind: "brand", id: BrandId.make("brand_b") }),
    );
    const missing = yield* Effect.flip(
      workflowView(person("user_org"), { kind: "site", id: SiteId.make("site_zz") }),
    );
    expect([hidden._tag, missing._tag]).toEqual(["ScopeNotFound", "ScopeNotFound"]);
  }).pipe(Effect.provide(core)),
);
