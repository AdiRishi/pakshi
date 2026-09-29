import { describe, expect, test } from "vitest";

import { destructiveChanges, type PlannedNode } from "../src/plan-guard.ts";

const siteDoc = { kind: "Cloudflare.DurableObject", name: "SiteDoc", className: "SiteDoc" };
const siteAgent = { kind: "Cloudflare.DurableObject", name: "SiteAgent", className: "SiteAgent" };
const remoteSubmissions = {
  ...siteDoc,
  className: "SiteSubmissions",
  scriptName: "pakshi-sitesapi",
};

type WorkerEnv = Readonly<Record<string, typeof siteDoc | typeof remoteSubmissions | string>>;

const worker = (action: string, before: WorkerEnv, after?: WorkerEnv): PlannedNode => ({
  action,
  resource: { Type: "Cloudflare.Worker", FQN: "StudioApi" },
  props: after === undefined ? undefined : { main: "index.ts", env: after },
  state: { props: { main: "index.ts", env: before } },
});

const store = (type: string, action: string): PlannedNode => ({
  action,
  resource: { Type: type, FQN: "Core" },
  state: { props: {} },
});

const check = (...nodes: ReadonlyArray<PlannedNode>) =>
  destructiveChanges({
    resources: Object.fromEntries(
      nodes
        .filter((n) => n.action !== "delete" && n.action !== "orphaned")
        .map((n, i) => [`r${i}`, n]),
    ),
    deletions: Object.fromEntries(
      nodes
        .filter((n) => n.action === "delete" || n.action === "orphaned")
        .map((n, i) => [`d${i}`, n]),
    ),
  });

describe("a production plan fails when it", () => {
  test.each(["Cloudflare.D1Database", "Cloudflare.R2.Bucket"])(
    "deletes or replaces a %s",
    (type) => {
      expect(check(store(type, "delete"))).toEqual([`delete ${type} Core`]);
      expect(check(store(type, "replace"))).toEqual([`replace ${type} Core`]);
    },
  );

  test("removes a Durable Object binding from its Worker", () => {
    const before = { SITE_DOC: siteDoc, SITE_AGENT: siteAgent, CORE: "d1" };
    expect(check(worker("update", before, { SITE_DOC: siteDoc, CORE: "d1" }))).toEqual([
      "update StudioApi deletes the Durable Object class SiteAgent (SITE_AGENT)",
    ]);
  });

  test("renames a Durable Object binding, which Alchemy treats as a new class", () => {
    const problems = check(worker("update", { SITE_DOC: siteDoc }, { SITE_DOCUMENT: siteDoc }));
    expect(problems).toEqual([
      "update StudioApi deletes the Durable Object class SiteDoc (SITE_DOC)",
    ]);
  });

  test("deletes or replaces a Worker that hosts Durable Objects", () => {
    expect(check(worker("delete", { SITE_DOC: siteDoc }))).toHaveLength(1);
    expect(check(worker("replace", { SITE_DOC: siteDoc }, { SITE_DOC: siteDoc }))).toHaveLength(1);
  });
});

describe("a production plan passes when it", () => {
  test("keeps every hosted class, even with other bindings changing", () => {
    const before = { SITE_DOC: siteDoc, CORE: "d1" };
    expect(check(worker("update", before, { SITE_DOC: siteDoc, ROUTING: "kv" }))).toEqual([]);
  });

  test("drops a binding to another Worker's class", () => {
    expect(check(worker("update", { SUBMISSIONS: remoteSubmissions }, {}))).toEqual([]);
  });

  test("retains removed stores, which plans them as orphaned", () => {
    expect(
      check(store("Cloudflare.D1Database", "orphaned"), worker("orphaned", { SITE_DOC: siteDoc })),
    ).toEqual([]);
  });

  test("only creates, updates or leaves things alone", () => {
    expect(
      check(store("Cloudflare.R2.Bucket", "create"), store("Cloudflare.D1Database", "update")),
    ).toEqual([]);
  });
});
