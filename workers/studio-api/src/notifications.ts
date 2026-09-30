import { BrandId, type SiteId } from "@repo/contracts/ids";
import { currentStep, type Submission } from "@repo/contracts/submission";
import { permissionsOn, rolesOn } from "@repo/domain/access";
import { eligibility } from "@repo/domain/approvals";
import { Effect, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

import { loadAccess } from "./access.ts";
import type { Notification } from "./site/outbox.ts";

const Recipient = Schema.Struct({ id: Schema.String, name: Schema.String, email: Schema.String });
type Recipient = typeof Recipient.Type;

const SiteRow = Schema.Struct({ name: Schema.String, brand_id: BrandId });

/** Everyone who may decide on the submission's current step now. */
const currentApprovers = Effect.fn("StudioApi.currentApprovers")(function* (
  site: { readonly id: SiteId; readonly brand: BrandId },
  submission: Submission,
) {
  const sql = yield* SqlClient.SqlClient;
  const step = submission.steps[currentStep(submission) ?? -1];
  if (step === undefined) return [];
  const candidates = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: Recipient,
    execute: () => sql`
      select id, name, email from "user"
      where id in (select value from json_each(${JSON.stringify(step.people.map((person) => person.id))}))
        or id in (
          select user_id from grants
          where role in (select value from json_each(${JSON.stringify(step.roles)}))
            and (scope_kind = 'organization'
              or (scope_kind = 'brand' and scope_id = ${site.brand})
              or (scope_kind = 'site' and scope_id = ${site.id})))`,
  })(undefined);
  const resource = { kind: "site", id: site.id, brand: site.brand } as const;
  return yield* Effect.filter(candidates, (person) =>
    Effect.map(
      loadAccess(person.id),
      ({ access }) =>
        eligibility(submission, {
          person: { id: person.id, name: person.name },
          roles: rolesOn(access, resource),
          permissions: permissionsOn(access, resource),
        }).ok,
    ),
  );
});

const submitterOf = Effect.fn("StudioApi.submitterOf")(function* (submission: Submission) {
  const sql = yield* SqlClient.SqlClient;
  return yield* SqlSchema.findAll({
    Request: Schema.String,
    Result: Recipient,
    execute: (id) => sql`select id, name, email from "user" where id = ${id}`,
  })(submission.submittedBy.id);
});

/** The email a notification sends, and who it goes to. */
const messageFor = (
  notification: Notification,
  submission: Submission,
  siteName: string,
  studio: string,
) => {
  const draft = `"${submission.draft.name}"`;
  const review = `${studio}/approvals/${submission.site}/${submission.id}`;
  const editor = `${studio}/sites/${submission.site}/drafts/${submission.draft.id}`;
  switch (notification._tag) {
    case "StepStarted": {
      const index = currentStep(submission) ?? 0;
      const step = submission.steps[index];
      return {
        subject: `Approve ${draft} on ${siteName}`,
        text: [
          `${submission.submittedBy.name} sent ${draft} for approval on ${siteName}.`,
          `You can approve step ${index + 1} of ${submission.steps.length}${step === undefined ? "" : `, ${step.name}`}.`,
          submission.note === "" ? "" : `Their note: ${submission.note}`,
          `Review it: ${review}`,
        ],
      };
    }
    case "Published":
      return {
        subject: `${draft} is live on ${siteName}`,
        text: [`${draft} was approved and published. It's live within about a minute.`],
      };
    case "ChangesRequested": {
      const status = submission.status;
      return {
        subject: `Changes requested on ${draft}`,
        text: [
          status._tag === "ChangesRequested"
            ? `${status.by.name} asked for changes to ${draft} on ${siteName}.`
            : `Changes were requested to ${draft} on ${siteName}.`,
          status._tag === "ChangesRequested" && status.note !== ""
            ? `Their note: ${status.note}`
            : "",
          `Open the draft: ${editor}`,
        ],
      };
    }
    case "NeedsUpdate":
      return {
        subject: `${draft} needs an update`,
        text: [
          `Another draft went live on ${siteName} while ${draft} was in review, and bringing it in needs your decision.`,
          `Update the draft and submit it again: ${editor}`,
        ],
      };
  }
};

/** Sends plain-text email from one address, such as the Email Service binding. */
export interface Mailer {
  readonly from: string;
  readonly send: (message: {
    readonly from: string;
    readonly to: string;
    readonly subject: string;
    readonly text: string;
  }) => Promise<void>;
}

/**
 * Emails the people a notification is for: the approvers of the
 * submission's current step when it starts, and its submitter when it's
 * decided or needs an update.
 */
export const notify = Effect.fn("StudioApi.notify")(function* (
  mailer: Mailer,
  site: SiteId,
  notification: Notification,
  submission: Submission,
  studio: string,
) {
  const sql = yield* SqlClient.SqlClient;
  const [found] = yield* SqlSchema.findAll({
    Request: Schema.String,
    Result: SiteRow,
    execute: (id) => sql`select name, brand_id from sites where id = ${id}`,
  })(site);
  if (found === undefined) return yield* Effect.die(`${site} isn't in D1.`);
  const recipients: ReadonlyArray<Recipient> =
    notification._tag === "StepStarted"
      ? yield* currentApprovers({ id: site, brand: found.brand_id }, submission)
      : yield* submitterOf(submission);
  const message = messageFor(notification, submission, found.name, studio);
  const text = message.text.filter((line) => line !== "").join("\n\n");
  yield* Effect.forEach(recipients, (recipient) =>
    Effect.promise(() =>
      mailer.send({
        from: mailer.from,
        to: recipient.email,
        subject: message.subject,
        text: `Hello ${recipient.name},\n\n${text}\n`,
      }),
    ),
  );
});
