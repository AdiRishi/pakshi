import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { newSite } from "./support/sites.ts";
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
  "people ask for blocks on their own sites, and the platform team reads and closes them",
  () =>
    Effect.gen(function* () {
      const priya = yield* studio(yield* admin);
      const libraries = yield* newSite(priya, "Libraries", "libraries");
      const parks = yield* newSite(priya, "Parks", "parks");
      const sam = yield* studio(
        yield* join(priya, { name: "Sam Okafor", email: "sam@riverton.test" }, "editor", {
          kind: "site",
          id: libraries.site,
        }),
      );
      const need = "A countdown to the first day of the reading challenge.";
      const filed = yield* sam.requestBlock({ site: libraries.site, need, example: "" });
      expect(filed).toMatchObject({ need, site: { name: "Libraries" }, closedAt: null });
      const refused = yield* Effect.flip(sam.requestBlock({ site: parks.site, need, example: "" }));
      expect(refused._tag).toBe("NotPermitted");

      const mine = yield* sam.blockRequests();
      expect(mine.can.close).toBe(false);
      expect(mine.sites.map((site) => site.name)).toEqual(["Libraries"]);
      expect((yield* Effect.flip(sam.closeBlockRequest({ request: filed.id })))._tag).toBe(
        "NotPermitted",
      );

      yield* priya.requestBlock({ site: null, need: "A map of every branch.", example: "" });
      const everyone = yield* priya.blockRequests();
      expect(everyone.can.close).toBe(true);
      expect(everyone.requests.map((request) => request.need).toSorted()).toEqual(
        ["A map of every branch.", need].toSorted(),
      );
      yield* priya.closeBlockRequest({ request: filed.id });
      expect((yield* sam.blockRequests()).requests[0]?.closedAt).not.toBeNull();
    }),
);
