import { DraftName } from "@repo/contracts/draft";
import { BrandId, DraftId, SiteId } from "@repo/contracts/ids";
import { ShareAccess } from "@repo/contracts/sharing";
import { Person, type SharedDraft, type SubmissionItem } from "@repo/contracts/studio";
import { Submission } from "@repo/contracts/submission";
import { permissionsOn, rolesOn } from "@repo/domain/access";
import { eligibility } from "@repo/domain/approvals";
import { Effect, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

import { loadAccess } from "./access.ts";

/*
 * Lists across sites, read from D1's copies of what each SiteDoc holds.
 * They can lag SiteDoc by seconds; anything a person acts on is checked
 * again by the site's SiteDoc.
 */

const SubmissionRow = Schema.Struct({
  site_id: SiteId,
  site_name: Schema.String,
  brand_id: BrandId,
  submission: Schema.fromJsonString(Submission),
});

const itemOf = (row: typeof SubmissionRow.Type): SubmissionItem => ({
  site: { id: row.site_id, name: row.site_name },
  submission: row.submission,
});

/** The recent history lists reach back this far. */
const finishedShown = 30;

/** Submissions under review whose current step the person may decide on now. */
export const waitingFor = Effect.fn("StudioApi.waitingFor")(function* (person: Person) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: SubmissionRow,
    execute: () => sql`
      select s.site_id, t.name as site_name, t.brand_id, s.submission from submissions s
      join sites t on t.id = s.site_id and t.deleted_at is null
      where s.status = 'InReview' order by s.submitted_at`,
  })(undefined);
  const { access } = yield* loadAccess(person.id);
  return rows
    .filter((row) => {
      const resource = { kind: "site", id: row.site_id, brand: row.brand_id } as const;
      return eligibility(row.submission, {
        person: { id: person.id, name: person.name },
        roles: rolesOn(access, resource),
        permissions: permissionsOn(access, resource),
      }).ok;
    })
    .map(itemOf);
});

/** The person's submissions still under review. */
export const sentBy = Effect.fn("StudioApi.sentBy")(function* (person: Person) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: SubmissionRow,
    execute: () => sql`
      select s.site_id, t.name as site_name, t.brand_id, s.submission from submissions s
      join sites t on t.id = s.site_id and t.deleted_at is null
      where s.status = 'InReview' and s.submitted_by = ${person.id}
      order by s.submitted_at desc`,
  })(undefined);
  return rows.map(itemOf);
});

/** Submissions no longer under review that the person sent or decided on, newest first. */
export const finishedFor = Effect.fn("StudioApi.finishedFor")(function* (person: Person) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: SubmissionRow,
    execute: () => sql`
      select s.site_id, t.name as site_name, t.brand_id, s.submission from submissions s
      join sites t on t.id = s.site_id and t.deleted_at is null
      where s.status <> 'InReview' and (
        s.submitted_by = ${person.id}
        or json_extract(s.submission, '$.status.by.id') = ${person.id}
        or exists (select 1 from json_each(s.submission, '$.approvals')
          where json_extract(value, '$.by.id') = ${person.id}))
      order by s.submitted_at desc limit ${finishedShown}`,
  })(undefined);
  return rows.map(itemOf);
});

const SharedRow = Schema.Struct({
  site_id: SiteId,
  site_name: Schema.String,
  draft_id: DraftId,
  draft_name: DraftName,
  access: ShareAccess,
});

/** Open drafts someone shared with the person by name. */
export const sharedWith = Effect.fn("StudioApi.sharedWith")(function* (person: Person) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: SharedRow,
    execute: () => sql`
      select d.site_id, s.name as site_name, d.draft_id, d.draft_name, d.access
      from draft_shares d join sites s on s.id = d.site_id and s.deleted_at is null
      where d.user_id = ${person.id} order by s.name, d.draft_name`,
  })(undefined);
  return rows.map((row): SharedDraft => ({
    site: { id: row.site_id, name: row.site_name },
    draft: { id: row.draft_id, name: row.draft_name },
    access: row.access,
  }));
});

/** Up to 20 people in the organization whose name or email contains the text. */
export const findPeople = Effect.fn("StudioApi.findPeople")(function* (search: string) {
  const sql = yield* SqlClient.SqlClient;
  const pattern = `%${search.trim().replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
  return yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: Person,
    execute: () => sql`
      select id, name, email from "user"
      where name like ${pattern} escape '\\' or email like ${pattern} escape '\\'
      order by name limit 20`,
  })(undefined);
});
