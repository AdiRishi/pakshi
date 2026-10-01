import { expect, it } from "@effect/vitest";
import { accountsPaths, authBasePath } from "@repo/contracts/accounts";
import { exports } from "cloudflare:workers";
import { Effect } from "effect";

import { post, setUp, studio, studioOrigin } from "./support/studio.ts";

const priya = {
  organization: "Riverton Council",
  name: "Priya Shah",
  email: "priya@riverton.test",
  password: "priya-password",
};

it.live("the first person sets Pakshi up, and nobody after them can", () =>
  Effect.gen(function* () {
    expect(yield* (yield* studio()).organization()).toBeNull();
    // A form posted from another site is refused before anything is made.
    const forged = yield* Effect.promise(() =>
      exports.default.fetch(
        new Request(`${studioOrigin}${accountsPaths.setUp}`, {
          method: "POST",
          headers: { origin: "https://evil.test", "content-type": "application/json" },
          body: JSON.stringify(priya),
        }),
      ),
    );
    expect(forged.status).toBe(403);

    const session = yield* setUp(priya);
    const viewer = yield* (yield* studio(session)).viewer();
    expect(viewer.organization).toBe("Riverton Council");
    expect(viewer.roles).toEqual([{ role: "Org admin", scope: "Riverton Council" }]);

    const again = yield* Effect.promise(() =>
      post(accountsPaths.setUp, { ...priya, email: "mallory@evil.test" }),
    );
    expect(again.status).toBe(409);
    // Better Auth's own sign-up answers browsers as if it didn't exist.
    const signUp = yield* Effect.promise(() =>
      post(`${authBasePath}/sign-up/email`, {
        name: "Mallory",
        email: "mallory@evil.test",
        password: "mallory-password",
      }),
    );
    expect(signUp.status).toBe(404);
  }).pipe(Effect.scoped),
);
