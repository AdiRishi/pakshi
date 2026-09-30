import { expect, it } from "@effect/vitest";
import { SiteId } from "@repo/contracts/ids";
import { Timestamp } from "@repo/contracts/release";
import { Effect } from "effect";

import { type Mailer, notify } from "../src/notifications.ts";
import { core } from "./support/core.ts";
import { northbankSubmission } from "./support/submissions.ts";

const northbank = SiteId.make("site_a1");
const studio = "https://studio.pakshi.test";

/** A mailer that keeps what it's asked to send. */
const outbox = () => {
  const sent: Array<Parameters<Mailer["send"]>[0]> = [];
  const mailer: Mailer = {
    from: "notifications@pakshi.test",
    send: (message) => Promise.resolve(void sent.push(message)),
  };
  return { sent, mailer };
};

it.effect("a step's start emails the people who may decide on it, with a link to review", () =>
  Effect.gen(function* () {
    const { sent, mailer } = outbox();
    const submission = northbankSubmission([
      {
        name: "Approvers",
        roles: ["approver"],
        people: [{ id: "user_org", name: "user_org" }],
        required: 1,
      },
    ]);
    yield* notify(mailer, northbank, { _tag: "StepStarted" }, submission, studio);
    expect(sent.map((message) => message.to).toSorted()).toEqual([
      "user_approver@pakshi.test",
      "user_org@pakshi.test",
    ]);
    expect(sent[0]).toMatchObject({
      subject: 'Approve "Opening hours" on Northbank Libraries',
      text: expect.stringContaining(`${studio}/approvals/site_a1/sub_hours`),
    });
  }).pipe(Effect.provide(core)),
);

it.effect("a decision emails the submitter", () =>
  Effect.gen(function* () {
    const { sent, mailer } = outbox();
    const approver = { id: "user_approver", name: "user_approver" };
    const submission = northbankSubmission([], {
      status: {
        _tag: "ChangesRequested",
        by: approver,
        at: Timestamp.make("2026-10-01T10:00:00.000Z"),
        note: "Check the Sunday hours.",
      },
    });
    yield* notify(mailer, northbank, { _tag: "ChangesRequested" }, submission, studio);
    expect(sent).toMatchObject([
      {
        to: "user_editor@pakshi.test",
        subject: 'Changes requested on "Opening hours"',
        text: expect.stringContaining("Check the Sunday hours."),
      },
    ]);
  }).pipe(Effect.provide(core)),
);
