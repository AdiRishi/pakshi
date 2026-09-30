import type { SiteId } from "@repo/contracts/ids";
import { Release } from "@repo/contracts/release";
import { Submission } from "@repo/contracts/submission";
import { Effect, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

import type { OutboxMessage } from "./site/outbox.ts";

/*
 * D1's copies of what each site's SiteDoc holds, for queries across sites.
 * Recording a copy again rewrites it, so a copy that drifted is put right.
 */

const encodeRelease = Schema.encodeSync(Schema.fromJsonString(Release));
const encodeSubmission = Schema.encodeSync(Schema.fromJsonString(Submission));

/** Writes one of a site's outbox copies into D1. */
export const recordCopy = Effect.fn("StudioApi.recordCopy")(function* (
  site: SiteId,
  message: Exclude<OutboxMessage, { readonly _tag: "Notify" }>,
) {
  const sql = yield* SqlClient.SqlClient;
  switch (message._tag) {
    case "Release": {
      const { seq, release } = message.release;
      yield* sql`insert into releases (id, site_id, seq, snapshot, release, published_at)
        values (${release.id}, ${site}, ${seq}, ${release.snapshot}, ${encodeRelease(release)}, ${release.at})
        on conflict (id) do update set site_id = excluded.site_id, seq = excluded.seq,
          snapshot = excluded.snapshot, release = excluded.release,
          published_at = excluded.published_at`;
      return;
    }
    case "Submission": {
      const { submission } = message;
      yield* sql`insert into submissions (id, site_id, status, submitted_by, submitted_at, submission)
        values (${submission.id}, ${site}, ${submission.status._tag}, ${submission.submittedBy.id},
          ${submission.submittedAt}, ${encodeSubmission(submission)})
        on conflict (id) do update set site_id = excluded.site_id, status = excluded.status,
          submitted_by = excluded.submitted_by, submitted_at = excluded.submitted_at,
          submission = excluded.submission`;
      return;
    }
    case "Shares": {
      // D1 has no transactions, so each statement leaves a copy that's right
      // for the people it covers, and delivering again finishes the job.
      for (const person of message.people)
        yield* sql`insert into draft_shares (site_id, draft_id, draft_name, user_id, access)
          values (${site}, ${message.draft}, ${message.name}, ${person.id}, ${person.access})
          on conflict (draft_id, user_id) do update set site_id = excluded.site_id,
            draft_name = excluded.draft_name, access = excluded.access`;
      yield* sql`delete from draft_shares where draft_id = ${message.draft}
        and user_id not in (select value from json_each(${JSON.stringify(message.people.map((person) => person.id))}))`;
      return;
    }
  }
});
