import { expect, it } from "@effect/vitest";
import { accountsPaths, authBasePath, InvitationToken } from "@repo/contracts/accounts";
import { exports } from "cloudflare:workers";
import { Effect } from "effect";

import {
  emailArriving,
  linkIn,
  post,
  sessionOf,
  setUp,
  signIn,
  studio,
  studioOrigin,
} from "./support/studio.ts";

const priya = {
  organization: "Riverton Council",
  name: "Priya Shah",
  email: "priya@riverton.test",
  password: "priya-password",
};

/** The organization's first admin, set up once for the file, whose storage every test shares. */
const admin = Effect.cached(setUp(priya)).pipe(Effect.runSync);

it.live("an invitation's link makes the account it was sent to, once", () =>
  Effect.gen(function* () {
    const priyaStudio = yield* studio(yield* admin);
    yield* priyaStudio.createBrand({
      name: "City Libraries",
      preset: "civic",
      brandColor: "#1f5c44",
    });
    const { brands } = yield* priyaStudio.newSiteOptions();
    const site = yield* priyaStudio.createSite({
      brand: brands[0]?.id ?? expect.unreachable(),
      name: "Northbank Libraries",
      address: "northbank",
    });
    const { link } = yield* priyaStudio.invite({
      email: "Sam@Riverton.test",
      role: "editor",
      scope: { kind: "site", id: site.site.id },
    });
    const email = yield* emailArriving("sam@riverton.test", "Priya Shah invited you");
    expect(linkIn(email.text)).toBe(link);
    const token = InvitationToken.make(link.split("/").at(-1) ?? "");

    const join = { token, name: "Sam Okafor", password: "s" };
    const joined = yield* Effect.promise(() => post(accountsPaths.join, join));
    expect(joined.status).toBe(204);
    const sam = yield* (yield* studio(sessionOf(joined))).viewer();
    expect(sam.roles).toEqual([{ role: "Editor", scope: "Northbank Libraries" }]);
    expect(sam.sites.map(({ id }) => id)).toEqual([site.site.id]);
    yield* signIn("sam@riverton.test", join.password);

    const again = yield* Effect.promise(() =>
      post(accountsPaths.join, { ...join, password: "another-password" }),
    );
    expect(again.status).toBe(409);
    expect(yield* (yield* studio()).invitation({ token })).toEqual({ _tag: "Closed" });
  }).pipe(Effect.scoped),
);

it.live("someone with an account accepts an invitation signed in, and only if it's theirs", () =>
  Effect.gen(function* () {
    const priyaStudio = yield* studio(yield* admin);
    const { link } = yield* priyaStudio.invite({
      email: priya.email,
      role: "approver",
      scope: { kind: "organization" },
    });
    const token = InvitationToken.make(link.split("/").at(-1) ?? "");
    expect(yield* (yield* studio()).invitation({ token })).toMatchObject({
      _tag: "Open",
      accountExists: true,
    });
    // An account can't be made for an address that has one.
    const joined = yield* Effect.promise(() =>
      post(accountsPaths.join, { token, name: "Someone", password: "someone-password" }),
    );
    expect(joined.status).toBe(409);
    yield* priyaStudio.acceptInvitation({ token });
    expect((yield* priyaStudio.viewer()).roles.map(({ role }) => role).toSorted()).toEqual([
      "Approver",
      "Org admin",
    ]);
  }).pipe(Effect.scoped),
);

it.live(
  "a forgotten password is reset through the emailed link, which signs out other sessions",
  () =>
    Effect.gen(function* () {
      const jonah = { email: "jonah@riverton.test", password: "jonah-password" };
      const { link } = yield* (yield* studio(yield* admin)).invite({
        email: jonah.email,
        role: "approver",
        scope: { kind: "organization" },
      });
      const joined = yield* Effect.promise(() =>
        post(accountsPaths.join, {
          token: link.split("/").at(-1) ?? "",
          name: "Jonah Reyes",
          password: jonah.password,
        }),
      );
      const before = sessionOf(joined);
      const requested = yield* Effect.promise(() =>
        post(`${authBasePath}/request-password-reset`, {
          email: jonah.email,
          redirectTo: `${studioOrigin}/reset-password`,
        }),
      );
      expect(requested.ok).toBe(true);
      const email = yield* emailArriving(jonah.email, "Reset your Pakshi password");
      const opened = yield* Effect.promise(() =>
        exports.default.fetch(new Request(linkIn(email.text), { redirect: "manual" })),
      );
      const landing = new URL(opened.headers.get("location") ?? "");
      expect(landing.pathname).toBe("/reset-password");
      const token = landing.searchParams.get("token") ?? "";

      const reset = yield* Effect.promise(() =>
        post(`${authBasePath}/reset-password`, { token, newPassword: "j" }),
      );
      expect(reset.ok).toBe(true);
      yield* signIn(jonah.email, "j");
      const stale = yield* Effect.flip((yield* studio(before)).viewer());
      expect(stale._tag).toBe("Unauthenticated");
    }).pipe(Effect.scoped),
);
