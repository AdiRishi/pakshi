import { expect, it } from "@effect/vitest";
import { InvitationToken } from "@repo/contracts/accounts";
import { BrandId, SiteId } from "@repo/contracts/ids";
import { Effect, Option } from "effect";
import { SqlClient } from "effect/unstable/sql";

import { loadAccess } from "../src/access.ts";
import { acceptInvitation, invitationView, invite, invitePlaces } from "../src/invitations.ts";
import type { Mailer } from "../src/notifications.ts";
import { organizationName, startOrganization } from "../src/organization.ts";
import { core } from "./support/core.ts";

const person = (id: string) => ({ id, name: id, email: `${id}@pakshi.test` });

const studio = "https://studio.pakshi.test";

/** A mailer that keeps what it was asked to send. */
const outbox = () => {
  const sent: Array<{ readonly to: string; readonly text: string }> = [];
  const mailer: Mailer = {
    from: "notifications@pakshi.test",
    send: async (message) => void sent.push(message),
  };
  return { sent, mailer };
};

const tokenOf = (link: string) => InvitationToken.make(link.split("/").at(-1) ?? "");

const northbank = { kind: "site", id: SiteId.make("site_a1") } as const;

/** A person with an account, who holds nothing yet. */
const newcomer = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`insert into "user" (id, name, email, emailVerified, createdAt, updatedAt)
    values ('user_new', 'Ana Ribeiro', 'ana@pakshi.test', 1, '2026-10-01', '2026-10-01')`;
  return { id: "user_new", name: "Ana Ribeiro", email: "Ana@Pakshi.test" };
});

it.effect(
  "a person can give only the roles whose permissions they hold, where they manage members",
  () =>
    Effect.gen(function* () {
      const places = (id: string) =>
        Effect.flatMap(loadAccess(id), ({ access }) => invitePlaces(access));
      const brandAdmin = yield* places("user_brand");
      expect(brandAdmin.map((place) => place.scope.name)).toEqual([
        "City Libraries",
        "Library Events",
        "Northbank Libraries",
      ]);
      // A brand admin doesn't hold approving, so can't make anyone an approver.
      expect(brandAdmin[0]?.roles).toEqual([
        "brand-admin",
        "site-admin",
        "editor",
        "submissions-viewer",
      ]);
      expect(yield* places("user_editor")).toEqual([]);
      const refused = yield* Effect.flip(
        invite(
          outbox().mailer,
          person("user_brand"),
          "a@pakshi.test",
          "approver",
          northbank,
          studio,
        ),
      );
      expect(refused._tag).toBe("NotPermitted");
    }).pipe(Effect.provide(core)),
);

it.effect("an invitation emails a link that gives its grant once, to its own address", () =>
  Effect.gen(function* () {
    const { sent, mailer } = outbox();
    const { link, invitation } = yield* invite(
      mailer,
      person("user_brand"),
      "ana@pakshi.test",
      "editor",
      northbank,
      studio,
    );
    expect(sent).toEqual([expect.objectContaining({ to: "ana@pakshi.test" })]);
    expect(sent[0]?.text).toContain(link);
    expect(invitation.scope).toEqual({ ...northbank, name: "Northbank Libraries" });
    const token = tokenOf(link);
    expect(yield* invitationView(token)).toMatchObject({
      _tag: "Open",
      organization: "Riverton Council",
      role: "editor",
      accountExists: false,
    });

    const ana = yield* newcomer;
    const stranger = yield* Effect.flip(acceptInvitation(person("user_editor"), token));
    expect(stranger._tag).toBe("InvitationClosed");
    yield* acceptInvitation(ana, token);
    const { access } = yield* loadAccess(ana.id);
    expect(access.grants).toEqual([{ role: "editor", scope: northbank }]);

    const again = yield* Effect.flip(acceptInvitation(ana, token));
    expect(again._tag).toBe("InvitationClosed");
    expect(yield* invitationView(token)).toEqual({ _tag: "Closed" });
  }).pipe(Effect.provide(core)),
);

it.effect("an expired invitation gives nothing", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const { link } = yield* invite(
      outbox().mailer,
      person("user_org"),
      "ana@pakshi.test",
      "brand-admin",
      { kind: "brand", id: BrandId.make("brand_b") },
      studio,
    );
    yield* sql`update invitations set expires_at = '2026-01-01T00:00:00.000Z'`;
    const ana = yield* newcomer;
    const expired = yield* Effect.flip(acceptInvitation(ana, tokenOf(link)));
    expect(expired._tag).toBe("InvitationClosed");
  }).pipe(Effect.provide(core)),
);

it.effect("someone who already holds the role there isn't invited again", () =>
  Effect.gen(function* () {
    const repeated = yield* Effect.flip(
      invite(
        outbox().mailer,
        person("user_org"),
        "user_editor@pakshi.test",
        "editor",
        { kind: "site", id: SiteId.make("site_a2") },
        studio,
      ),
    );
    expect(repeated._tag).toBe("AlreadyMember");
  }).pipe(Effect.provide(core)),
);

it.effect("an organization is set up once, by its first admin", () =>
  Effect.gen(function* () {
    // The shared fixture's organization exists, so a second setup is refused and changes nothing.
    expect(yield* startOrganization("Another council", "user_editor")).toBe(false);
    expect(yield* organizationName).toEqual(Option.some("Riverton Council"));
    const { access } = yield* loadAccess("user_editor");
    expect(access.grants.map((grant) => grant.role)).toEqual(["editor"]);
  }).pipe(Effect.provide(core)),
);
