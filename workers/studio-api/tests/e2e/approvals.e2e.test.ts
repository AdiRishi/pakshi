import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { edit, newSite, readyPage, served } from "./support/sites.ts";
import { emailArriving, join, setUp, studio } from "./support/studio.ts";

const admin = Effect.cached(
  setUp({
    organization: "Riverton Council",
    name: "Priya Shah",
    email: "priya@riverton.test",
    password: "priya-password",
  }),
).pipe(Effect.runSync);

/** A site whose own workflow needs one approval from anyone with the approver role there. */
const siteWithOneStep = (address: string) =>
  Effect.gen(function* () {
    const client = yield* studio(yield* admin);
    const created = yield* newSite(client, `Site ${address}`, address);
    yield* client.saveWorkflow({
      scope: { kind: "site", id: created.site },
      steps: [{ name: "Communications", roles: ["approver"], people: [], required: 1 }],
    });
    yield* edit(client, created.site, created.draft, readyPage(created.home, "Welcome"));
    return { client, ...created };
  });

it.live(
  "a submission waits for its step's approvers, who are emailed, and the last approval publishes",
  () =>
    Effect.gen(function* () {
      const { client, site, draft } = yield* siteWithOneStep("northbank");
      const jonah = yield* studio(
        yield* join(client, { name: "Jonah Reyes", email: "jonah@riverton.test" }, "approver", {
          kind: "site",
          id: site,
        }),
      );
      const submitted = yield* client.submitDraft({ site, draft, note: "Ready for launch" });
      if (submitted._tag !== "Submitted") return yield* Effect.die(submitted._tag);
      expect((yield* served("northbank"))?.manifest?.pages).toEqual([]);

      // Approvers are emailed when their step starts.
      const notice = yield* emailArriving("jonah@riverton.test", "Approve");
      expect(notice.text).toContain(`/approvals/${site}/${submitted.submission.id}`);

      const waiting = yield* jonah.approvals();
      expect(waiting.waiting.map(({ submission }) => submission.id)).toEqual([
        submitted.submission.id,
      ]);
      const decided = yield* jonah.decide({
        site,
        submission: submitted.submission.id,
        snapshot: submitted.submission.snapshot,
        decision: "approve",
        note: "",
      });
      expect(decided._tag).toBe("Published");
      expect((yield* served("northbank"))?.manifest?.pages.map(({ path }) => path)).toEqual(["/"]);
    }).pipe(Effect.scoped),
);

it.live("two final approvals at once make exactly one release", () =>
  Effect.gen(function* () {
    const { client, site, draft } = yield* siteWithOneStep("events");
    const approvers = yield* Effect.forEach(["ana", "tom"], (name) =>
      Effect.flatMap(
        join(client, { name, email: `${name}@riverton.test` }, "approver", {
          kind: "site",
          id: site,
        }),
        studio,
      ),
    );
    const submitted = yield* client.submitDraft({ site, draft, note: "" });
    if (submitted._tag !== "Submitted") return yield* Effect.die(submitted._tag);
    const decisions = yield* Effect.forEach(
      approvers,
      (approver) =>
        approver.decide({
          site,
          submission: submitted.submission.id,
          snapshot: submitted.submission.snapshot,
          decision: "approve",
          note: "",
        }),
      { concurrency: "unbounded" },
    );
    expect(decisions.map(({ _tag }) => _tag).toSorted()).toEqual(["Closed", "Published"]);
    const releases = yield* client.siteReleases({ site });
    expect(releases.releases.map(({ _tag }) => _tag)).toEqual(["Published", "Created"]);
  }).pipe(Effect.scoped),
);

it.live("a decision on a submission that changed since it was loaded is refused", () =>
  Effect.gen(function* () {
    const { client, site, draft } = yield* siteWithOneStep("parks");
    const approver = yield* studio(
      yield* join(client, { name: "Hana", email: "hana@riverton.test" }, "approver", {
        kind: "site",
        id: site,
      }),
    );
    const first = yield* client.submitDraft({ site, draft, note: "" });
    const second = yield* client.submitDraft({ site, draft, note: "Sent again" });
    if (first._tag !== "Submitted" || second._tag !== "Submitted")
      return yield* Effect.die("Both submissions wait for approval.");
    // The first was replaced by the second, so a decision made looking at it records nothing.
    const stale = yield* approver.decide({
      site,
      submission: first.submission.id,
      snapshot: first.submission.snapshot,
      decision: "approve",
      note: "",
    });
    expect(stale._tag).toBe("Closed");
    expect((yield* served("parks"))?.manifest?.pages).toEqual([]);
  }).pipe(Effect.scoped),
);
