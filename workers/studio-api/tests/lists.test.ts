import { expect, it } from "@effect/vitest";
import { DraftId, SiteId } from "@repo/contracts/ids";
import { Timestamp } from "@repo/contracts/release";
import { Effect } from "effect";

import { recordCopy } from "../src/copies.ts";
import { findPeople, finishedFor, sentBy, sharedWith, waitingFor } from "../src/lists.ts";
import { core } from "./support/core.ts";
import { northbankSubmission } from "./support/submissions.ts";

const person = (id: string) => ({ id, name: id, email: `${id}@pakshi.test` });
const northbank = SiteId.make("site_a1");
const approvers = [{ name: "Approvers", roles: ["approver" as const], people: [], required: 1 }];

it.effect("a submission waits only for the people who may decide on its current step", () =>
  Effect.gen(function* () {
    yield* recordCopy(northbank, {
      _tag: "Submission",
      submission: northbankSubmission(approvers),
    });
    const waiting = yield* waitingFor(person("user_approver"));
    expect(waiting.map((item) => [item.site.name, item.submission.id])).toEqual([
      ["Northbank Libraries", "sub_hours"],
    ]);
    // The org admin holds every permission, but the step names only approvers.
    expect(yield* waitingFor(person("user_org"))).toEqual([]);
    expect((yield* sentBy(person("user_editor"))).length).toBe(1);
  }).pipe(Effect.provide(core)),
);

it.effect("a decided submission is finished for whoever sent it or decided on it", () =>
  Effect.gen(function* () {
    const at = Timestamp.make("2026-10-01T10:00:00.000Z");
    const approver = { id: "user_approver", name: "user_approver" };
    yield* recordCopy(northbank, {
      _tag: "Submission",
      submission: northbankSubmission(approvers, {
        status: { _tag: "ChangesRequested", by: approver, at, note: "Check the Sunday hours." },
      }),
    });
    expect(yield* waitingFor(person("user_approver"))).toEqual([]);
    expect((yield* finishedFor(person("user_approver"))).length).toBe(1);
    expect((yield* finishedFor(person("user_editor"))).length).toBe(1);
    expect(yield* finishedFor(person("user_org"))).toEqual([]);
  }).pipe(Effect.provide(core)),
);

it.effect("a draft is listed for the people it's shared with, until they're taken off", () =>
  Effect.gen(function* () {
    const draft = DraftId.make("dr_hours");
    yield* recordCopy(northbank, {
      _tag: "Shares",
      draft,
      name: "Opening hours",
      people: [
        { id: "user_editor", access: "edit" },
        { id: "user_approver", access: "view" },
      ],
    });
    expect(yield* sharedWith(person("user_approver"))).toEqual([
      {
        site: { id: northbank, name: "Northbank Libraries" },
        draft: { id: draft, name: "Opening hours" },
        access: "view",
      },
    ]);
    yield* recordCopy(northbank, {
      _tag: "Shares",
      draft,
      name: "Winter hours",
      people: [{ id: "user_editor", access: "view" }],
    });
    expect(yield* sharedWith(person("user_approver"))).toEqual([]);
    expect(yield* sharedWith(person("user_editor"))).toMatchObject([
      { draft: { name: "Winter hours" }, access: "view" },
    ]);
  }).pipe(Effect.provide(core)),
);

it.effect("people are found by any part of their name or email, taking the text literally", () =>
  Effect.gen(function* () {
    expect((yield* findPeople("approv")).map((found) => found.id)).toEqual(["user_approver"]);
    expect(yield* findPeople("%")).toEqual([]);
  }).pipe(Effect.provide(core)),
);
