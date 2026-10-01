import { expect, it } from "@effect/vitest";
import type { DraftSharing } from "@repo/contracts/sharing";
import { Effect } from "effect";

import { edit, newSite, readyPage } from "./support/sites.ts";
import { join, setUp, studio } from "./support/studio.ts";

const admin = Effect.cached(
  setUp({
    organization: "Riverton Council",
    name: "Priya Shah",
    email: "priya@riverton.test",
    password: "priya-password",
  }),
).pipe(Effect.runSync);

it.live(
  "a preview opens for whoever the draft is shared with, and stops at once when sharing ends",
  () =>
    Effect.gen(function* () {
      const priya = yield* studio(yield* admin);
      const { site, draft, home } = yield* newSite(priya, "Northbank Libraries", "northbank");
      yield* edit(priya, site, draft, readyPage(home, "Welcome"));
      // An approver on the site doesn't edit its pages, so only sharing shows them a draft.
      const jonah = yield* studio(
        yield* join(priya, { name: "Jonah Reyes", email: "jonah@riverton.test" }, "approver", {
          kind: "site",
          id: site,
        }),
      );
      const visitor = yield* studio();
      const preview = (client: typeof priya) => client.previewPage({ site, draft, path: "/" });
      const share = (sharing: DraftSharing) => priya.shareDraft({ site, draft, sharing });
      const { user } = yield* jonah.viewer();
      const nobody = { people: [], general: { audience: "people", access: "view" } } as const;

      expect((yield* preview(jonah))._tag).toBe("NotFound");
      expect((yield* preview(visitor))._tag).toBe("SignIn");

      yield* share({ ...nobody, people: [{ person: user, access: "view" }] });
      const shown = yield* preview(jonah);
      if (shown._tag !== "Page") return yield* Effect.die(shown._tag);
      expect(shown.access).toBe("view");
      expect(shown.view.page?.root).toHaveLength(1);
      expect((yield* preview(visitor))._tag).toBe("SignIn");

      yield* share({ people: [], general: { audience: "link", access: "view" } });
      expect((yield* preview(visitor))._tag).toBe("Page");

      yield* share(nobody);
      expect((yield* preview(jonah))._tag).toBe("NotFound");
      expect((yield* preview(visitor))._tag).toBe("SignIn");
    }).pipe(Effect.scoped),
);
