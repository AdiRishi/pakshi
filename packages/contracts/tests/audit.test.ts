import { expect, test } from "vitest";

import { AuditEvent, auditKinds } from "../src/audit.ts";

test("the audit log's filters cover every kind of event exactly once", () => {
  const filtered = Object.values(auditKinds).flatMap((kind) => kind.events);
  expect(filtered.toSorted()).toEqual(Object.keys(AuditEvent.cases).toSorted());
});
