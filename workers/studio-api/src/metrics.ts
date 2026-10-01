import { Timestamp } from "@repo/contracts/release";
import { NotPermitted, type Person, type SuccessMetrics } from "@repo/contracts/studio";
import { authorize } from "@repo/domain/access";
import { businessDaysBetween, median } from "@repo/domain/metrics";
import { Effect, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

import { loadAccess } from "./access.ts";

/*
 * Pakshi's success metrics, worked out from what it records anyway: D1's
 * copies of each site's releases and submissions, the audit log and block
 * requests. AI Gateway keeps what the agent costs, tagged by site.
 */

const LaunchRow = Schema.Struct({ created_at: Timestamp, first_publish: Timestamp });

const ChangeRow = Schema.Struct({ started: Timestamp, submitted: Timestamp });

const DecisionRow = Schema.Struct({ submitted: Timestamp, decided: Timestamp });

const MonthRow = Schema.Struct({ month: Schema.String, count: Schema.Int });

/** The months from one moment to now, as `2026-09`, oldest first. */
const monthsSince = (since: string) => {
  const months: Array<string> = [];
  const start = new Date(since);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor.getTime() <= Date.now()) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
};

/** Pakshi's success metrics since a moment, for someone who may read the whole audit log. */
export const successMetrics = Effect.fn("StudioApi.successMetrics")(function* (
  person: Person,
  since: Timestamp,
) {
  const sql = yield* SqlClient.SqlClient;
  const { access } = yield* loadAccess(person.id);
  if (!authorize(access, "audit.read", { kind: "organization" }))
    return yield* new NotPermitted({ action: "read Pakshi's success metrics" });
  const [launches, changes, decisions, requests, active, turns, undone, [untracked]] =
    yield* Effect.all(
      [
        SqlSchema.findAll({
          Request: Schema.Void,
          Result: LaunchRow,
          execute: () => sql`
            select s.created_at, min(r.published_at) as first_publish
            from sites s join releases r on r.site_id = s.id
            where json_extract(r.release, '$._tag') = 'Published'
            group by s.id having min(r.published_at) >= ${since}`,
        })(undefined),
        SqlSchema.findAll({
          Request: Schema.Void,
          Result: ChangeRow,
          execute: () => sql`
            select json_extract(event, '$.draftStartedAt') as started, min(at) as submitted
            from audit_log where kind = 'SubmittedForApproval'
            group by json_extract(event, '$.draft.id')
            having min(at) >= ${since}`,
        })(undefined),
        SqlSchema.findAll({
          Request: Schema.Void,
          Result: DecisionRow,
          execute: () => sql`
            select submitted_at as submitted, json_extract(submission, '$.status.at') as decided
            from submissions
            where status in ('Published', 'ChangesRequested')
              and json_array_length(submission, '$.steps') > 0
              and json_extract(submission, '$.status.at') >= ${since}`,
        })(undefined),
        SqlSchema.findAll({
          Request: Schema.Void,
          Result: MonthRow,
          execute: () => sql`
            select substr(created_at, 1, 7) as month, count(*) as count from block_requests
            where created_at >= ${since} group by month`,
        })(undefined),
        SqlSchema.findAll({
          Request: Schema.Void,
          Result: MonthRow,
          execute: () => sql`
            select substr(at, 1, 7) as month, count(distinct site_id) as count from audit_log
            where at >= ${since} and site_id is not null
              and kind in ('EditingSession', 'AgentTurn', 'Published')
            group by month`,
        })(undefined),
        SqlSchema.findAll({
          Request: Schema.Void,
          Result: Schema.Struct({ turn: Schema.String }),
          execute: () => sql`select json_extract(event, '$.turn') as turn from audit_log
            where kind = 'AgentTurn' and at >= ${since}`,
        })(undefined),
        SqlSchema.findAll({
          Request: Schema.Void,
          Result: Schema.Struct({ turn: Schema.String }),
          execute: () => sql`select json_extract(event, '$.turn') as turn from audit_log
            where kind = 'AgentTurnUndone'`,
        })(undefined),
        sql<{ readonly count: number }>`select count(*) as count from audit_log
          where kind = 'LiveReleaseRestored' and at >= ${since}`,
      ],
      { concurrency: "unbounded" },
    );
  const undid = new Set(undone.map((row) => row.turn));
  const countIn = (rows: ReadonlyArray<typeof MonthRow.Type>, month: string) =>
    rows.find((row) => row.month === month)?.count ?? 0;
  return {
    since,
    timeToLaunch: {
      median: median(
        launches.map((launch) => businessDaysBetween(launch.created_at, launch.first_publish)),
      ),
      sites: launches.length,
    },
    timeToChange: {
      median: median(
        changes.map(
          (change) => (Date.parse(change.submitted) - Date.parse(change.started)) / 60_000,
        ),
      ),
      drafts: changes.length,
    },
    blockRequests: monthsSince(since).map((month) => ({
      month,
      requests: countIn(requests, month),
      activeSites: countIn(active, month),
    })),
    approvalTurnaround: {
      median: median(
        decisions.map((decision) => businessDaysBetween(decision.submitted, decision.decided)),
      ),
      submissions: decisions.length,
    },
    agentSuccess: {
      turns: turns.length,
      kept: turns.filter((turn) => !undid.has(turn.turn)).length,
    },
    untrackedChanges: untracked?.count ?? 0,
  } satisfies SuccessMetrics;
});
