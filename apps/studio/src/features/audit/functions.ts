import { AuditCursor, AuditQuery } from "@repo/contracts/audit";
import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { studio } from "@/server/studio";

/** A page of the audit log entries the person may read, newest first. */
export const getAuditLog = createServerFn({ method: "GET" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({ query: AuditQuery, before: Schema.NullOr(AuditCursor) }),
    ),
  )
  .handler(({ data }) => studio((client) => client.auditLog(data)));

/** The people and sites the audit log can be filtered by. */
export const getAuditFilters = createServerFn({ method: "GET" }).handler(() =>
  studio((client) => client.auditFilters()),
);
