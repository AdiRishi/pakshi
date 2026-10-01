import { expect, it } from "@effect/vitest";
import type { AuditKind } from "@repo/contracts/audit";
import type { SiteId } from "@repo/contracts/ids";
import { Effect } from "effect";

import { edit, newSite, publish, readyPage } from "./support/sites.ts";
import { eventually, join, setUp, studio } from "./support/studio.ts";

const admin = Effect.cached(
  setUp({
    organization: "Riverton Council",
    name: "Priya Shah",
    email: "priya@riverton.test",
    password: "priya-password",
  }),
).pipe(Effect.runSync);

type Studio = Effect.Success<ReturnType<typeof studio>>;

/** The events the audit log lists for a site, newest first. */
const logged = (client: Studio, site: SiteId, kinds: ReadonlyArray<AuditKind> = []) =>
  Effect.map(
    client.auditLog({
      query: { person: null, site, kinds, since: null, until: null },
      before: null,
    }),
    (page) => page.rows.map((row) => row.entry.event._tag),
  );

it.live("what people do on a site reaches the audit log, publishes and rollbacks included", () =>
  Effect.gen(function* () {
    const priya = yield* studio(yield* admin);
    const { site, draft, home } = yield* newSite(priya, "Northbank Libraries", "northbank");
    yield* edit(priya, site, draft, readyPage(home, "Welcome"));
    yield* publish(priya, site, draft);
    const hours = yield* priya.createDraft({ site, name: "Opening hours" });
    yield* priya.shareDraft({
      site,
      draft: hours.id,
      sharing: { people: [], general: { audience: "organization", access: "view" } },
    });
    yield* priya.rollBack({ site });

    // SiteDoc sends its entries through its outbox, after answering.
    const events = yield* eventually(
      Effect.filterOrFail(
        logged(priya, site),
        (tags) => tags.includes("RolledBack"),
        () => "Not delivered yet",
      ),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        "SiteCreated",
        "EditingSession",
        "SubmittedForApproval",
        "Published",
        "DraftCreated",
        "DraftShared",
        "RolledBack",
      ]),
    );
    expect(yield* logged(priya, site, ["publishes", "rollbacks"])).toEqual([
      "RolledBack",
      "Published",
    ]);
  }),
);

it.live("only people who may read the audit log can, and they can export it", () =>
  Effect.gen(function* () {
    const priya = yield* studio(yield* admin);
    const { site } = yield* newSite(priya, "Parks", "parks");
    const sam = yield* studio(
      yield* join(priya, { name: "Sam Okafor", email: "sam@riverton.test" }, "site-admin", {
        kind: "site",
        id: site,
      }),
    );
    const query = { person: null, site: null, kinds: [], since: null, until: null };
    expect((yield* Effect.flip(sam.auditLog({ query, before: null })))._tag).toBe("NotPermitted");
    expect((yield* Effect.flip(sam.exportAudit({ query })))._tag).toBe("NotPermitted");
    const { csv } = yield* priya.exportAudit({ query });
    expect(csv.split("\r\n")[0]).toBe("Time,Person,Event,Site,Brand,Details");
    expect(csv).toContain("Invited sam@riverton.test as Site admin on Parks");
  }),
);
