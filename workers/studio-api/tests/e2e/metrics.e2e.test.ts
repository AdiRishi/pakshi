import { expect, it } from "@effect/vitest";
import { Timestamp } from "@repo/contracts/release";
import { Effect } from "effect";

import { edit, newSite, readyPage } from "./support/sites.ts";
import { eventually, join, setUp, studio } from "./support/studio.ts";

const admin = Effect.cached(
  setUp({
    organization: "Riverton Council",
    name: "Priya Shah",
    email: "priya@riverton.test",
    password: "priya-password",
  }),
).pipe(Effect.runSync);

const sinceYesterday = () =>
  Timestamp.make(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

it.live("every success metric is recorded as people launch, change and approve sites", () =>
  Effect.gen(function* () {
    const priya = yield* studio(yield* admin);
    const { site, draft, home } = yield* newSite(priya, "Northbank Libraries", "northbank");
    yield* priya.saveWorkflow({
      scope: { kind: "site", id: site },
      steps: [
        { name: "Comms", roles: [{ id: "approver", name: "Approver" }], people: [], required: 1 },
      ],
    });
    const jonah = yield* studio(
      yield* join(priya, { name: "Jonah Reyes", email: "jonah@riverton.test" }, "approver", {
        kind: "site",
        id: site,
      }),
    );
    yield* edit(priya, site, draft, readyPage(home, "Welcome"));
    const submitted = yield* priya.submitDraft({ site, draft, note: "" });
    if (submitted._tag !== "Submitted") return yield* Effect.die(submitted._tag);
    yield* jonah.decide({
      site,
      submission: submitted.submission.id,
      snapshot: submitted.submission.snapshot,
      decision: "approve",
      note: "",
    });
    yield* priya.requestBlock({ site, need: "A countdown.", example: "" });

    const metrics = yield* eventually(
      Effect.filterOrFail(
        priya.successMetrics({ since: sinceYesterday() }),
        (found) => found.timeToLaunch.sites === 1,
        () => "The release hasn't reached D1 yet",
      ),
    );
    expect(metrics).toMatchObject({
      timeToLaunch: { sites: 1 },
      timeToChange: { drafts: 1 },
      approvalTurnaround: { submissions: 1 },
      agentSuccess: { turns: 0, kept: 0 },
      untrackedChanges: 0,
    });
    expect(metrics.blockRequests.at(-1)).toMatchObject({ requests: 1, activeSites: 1 });
    expect(metrics.timeToChange.median).toBeLessThan(60);

    expect((yield* Effect.flip(jonah.successMetrics({ since: sinceYesterday() })))._tag).toBe(
      "NotPermitted",
    );
  }),
);
