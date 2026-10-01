import { expect, it } from "@effect/vitest";
import { BatchId, randomId } from "@repo/contracts/ids";
import {
  ClientMessageJson,
  liveBasePath,
  ServerMessage,
  ServerMessageJson,
} from "@repo/contracts/live";
import { Effect, Schema } from "effect";

import { newSite, textSection } from "./support/sites.ts";
import { openSocket } from "./support/sockets.ts";
import { join, setUp, studio } from "./support/studio.ts";

const admin = Effect.cached(
  setUp({
    organization: "Riverton Council",
    name: "Priya Shah",
    email: "priya@riverton.test",
    password: "priya-password",
  }),
).pipe(Effect.runSync);

const encode = Schema.encodeSync(ClientMessageJson);
const { guards } = ServerMessage;

const when =
  <A extends ServerMessage>(guard: (message: ServerMessage) => message is A) =>
  (message: ServerMessage) =>
    guard(message) ? message : undefined;

/** A site with an editor Sam working in its first draft over a live connection. */
const samEditing = (address: string) =>
  Effect.gen(function* () {
    const priya = yield* studio(yield* admin);
    const created = yield* newSite(priya, `Site ${address}`, address);
    const site = { kind: "site", id: created.site } as const;
    const session = yield* join(
      priya,
      { name: "Sam Okafor", email: `sam-${address}@riverton.test` },
      "editor",
      site,
    );
    const sam = (yield* (yield* studio(session)).viewer()).user;
    const socket = yield* openSocket(
      ServerMessageJson,
      `${liveBasePath}/${created.site}/${created.draft}`,
      session,
    );
    socket.send(encode({ _tag: "Sync", revision: 0 }));
    yield* socket.next(when(guards.Synced));
    /** Sends a batch adding a section, and returns its ID. */
    const addSection = (heading: string) => {
      const id = BatchId.make(randomId("bat"));
      socket.send(
        encode({
          _tag: "Batch",
          batch: {
            id,
            ops: [
              {
                op: "insertBlock",
                page: created.home,
                list: "root",
                after: null,
                block: textSection(heading),
              },
            ],
          },
        }),
      );
      return id;
    };
    /** The headings on the draft's home page, as Priya sees them. */
    const sections = Effect.map(
      priya.openDraft({ site: created.site, draft: created.draft }),
      (opened) =>
        Object.values(
          opened._tag === "Ready" ? (opened.draft.pages[created.home]?.blocks ?? {}) : {},
        ).flatMap((block) => (block.type === "rich-text" ? [block.props["heading"]] : [])),
    );
    return { ...created, priya, sam, site, socket, addSection, sections };
  });

it.live("taking away someone's role stops their next batch at once", () =>
  Effect.gen(function* () {
    const { priya, sam, site, socket, addSection, sections } = yield* samEditing("northbank");
    const kept = addSection("Opening hours");
    expect((yield* socket.next(when(guards.Committed))).batch.id).toBe(kept);

    yield* priya.revokeRole({ person: sam.id, role: "editor", scope: site });
    yield* socket.next(when(guards.AccessEnded));
    expect(yield* socket.closed).toBe(1008);
    expect(yield* sections).toEqual(["Opening hours"]);
  }).pipe(Effect.scoped),
);

it.live("switching a permission off with an override stops the next batch too", () =>
  Effect.gen(function* () {
    const { priya, sam, site, socket, sections } = yield* samEditing("parks");
    yield* priya.setOverride({
      person: sam.id,
      permission: "page.edit",
      scope: site,
      allowed: false,
    });
    yield* socket.next(when(guards.AccessEnded));
    expect(yield* sections).toEqual([]);
  }).pipe(Effect.scoped),
);

it.live("changing a custom role reaches everyone who holds it", () =>
  Effect.gen(function* () {
    const { priya, sam, site, socket, addSection, sections } = yield* samEditing("harbour");
    const reviewer = yield* priya.saveRole({
      role: null,
      name: "Content reviewer",
      description: "Edits drafts and approves them.",
      permissions: ["page.edit", "site.approve"],
    });
    yield* priya.changeRole({ person: sam.id, from: "editor", to: reviewer.id, scope: site });
    const kept = addSection("Still editing");
    expect((yield* socket.next(when(guards.Committed))).batch.id).toBe(kept);

    yield* priya.saveRole({
      role: reviewer.id,
      name: "Content reviewer",
      description: "Approves drafts.",
      permissions: ["site.approve"],
    });
    yield* socket.next(when(guards.AccessEnded));
    expect(yield* sections).toEqual(["Still editing"]);
  }).pipe(Effect.scoped),
);

it.live(
  "no one can give a permission they don't hold, or access where they don't manage members",
  () =>
    Effect.gen(function* () {
      const priya = yield* studio(yield* admin);
      const libraries = yield* newSite(priya, "Libraries", "libraries");
      const parks = yield* newSite(priya, "Parks", "parks-trails");
      const meera = yield* studio(
        yield* join(priya, { name: "Meera Kapoor", email: "meera@riverton.test" }, "brand-admin", {
          kind: "brand",
          id: libraries.brand,
        }),
      );
      yield* join(priya, { name: "Owen Clarke", email: "owen@riverton.test" }, "editor", {
        kind: "site",
        id: libraries.site,
      });
      const owen = (yield* priya.people({ search: "owen" }))[0];
      if (owen === undefined) return yield* Effect.die("Owen joined.");
      const onLibraries = { kind: "site", id: libraries.site } as const;
      const refused = <A, E extends { readonly _tag: string }>(effect: Effect.Effect<A, E>) =>
        Effect.map(Effect.flip(effect), (error) => error._tag);

      // A brand admin holds no approving, so can't give it by role or by override.
      expect(
        yield* refused(meera.grantRole({ person: owen.id, role: "approver", scope: onLibraries })),
      ).toBe("NotPermitted");
      expect(
        yield* refused(
          meera.setOverride({
            person: owen.id,
            permission: "site.approve",
            scope: onLibraries,
            allowed: true,
          }),
        ),
      ).toBe("NotPermitted");
      // Nor give anything on a site in another brand, or across the organization.
      expect(
        yield* refused(
          meera.grantRole({
            person: owen.id,
            role: "editor",
            scope: { kind: "site", id: parks.site },
          }),
        ),
      ).toBe("NotPermitted");
      expect(
        yield* refused(
          meera.grantRole({ person: owen.id, role: "editor", scope: { kind: "organization" } }),
        ),
      ).toBe("NotPermitted");
      // A custom role is held to the same rule as the permissions in it.
      const reviewer = yield* priya.saveRole({
        role: null,
        name: "Reviewer",
        description: "",
        permissions: ["page.edit", "site.approve"],
      });
      expect(
        yield* refused(meera.grantRole({ person: owen.id, role: reviewer.id, scope: onLibraries })),
      ).toBe("NotPermitted");
      // And no one but an admin who holds every permission in a role can make one.
      expect(
        yield* refused(
          meera.saveRole({
            role: null,
            name: "Helper",
            description: "",
            permissions: ["page.edit"],
          }),
        ),
      ).toBe("NotPermitted");
      // What the brand admin does hold, they can give.
      yield* meera.grantRole({ person: owen.id, role: "site-admin", scope: onLibraries });
      yield* meera.setOverride({
        person: owen.id,
        permission: "submissions.delete",
        scope: onLibraries,
        allowed: false,
      });
      const people = yield* priya.organizationPeople();
      const held = people.members.find((member) => member.person.id === owen.id);
      expect(held?.grants.map((grant) => grant.role.id).toSorted()).toEqual([
        "editor",
        "site-admin",
      ]);
      expect(held?.overrides).toMatchObject([{ permission: "submissions.delete", allowed: false }]);
    }),
);

it.live("the organization always keeps an org admin", () =>
  Effect.gen(function* () {
    const priya = yield* studio(yield* admin);
    const me = (yield* priya.viewer()).user;
    const organization = { kind: "organization" } as const;
    const refusal = yield* Effect.flip(
      priya.revokeRole({ person: me.id, role: "org-admin", scope: organization }),
    );
    expect(refusal._tag).toBe("LastOrgAdmin");
    expect((yield* Effect.flip(priya.removeAllAccess({ person: me.id })))._tag).toBe(
      "LastOrgAdmin",
    );
  }),
);

it.live("every change of access is in the audit log", () =>
  Effect.gen(function* () {
    const { priya, sam, site } = yield* samEditing("audit-trail");
    yield* priya.setOverride({
      person: sam.id,
      permission: "draft.share",
      scope: site,
      allowed: false,
    });
    yield* priya.revokeRole({ person: sam.id, role: "editor", scope: site });
    const { rows } = yield* priya.auditLog({
      query: { person: null, site: site.id, kinds: ["permissions"], since: null, until: null },
      before: null,
    });
    expect(rows.map((row) => row.entry.event._tag)).toEqual([
      "RoleRevoked",
      "OverrideSet",
      "InvitationAccepted",
      "Invited",
    ]);
    expect(rows[0]?.entry).toMatchObject({
      actor: { name: "Priya Shah" },
      event: { person: { name: "Sam Okafor" }, role: { id: "editor" } },
    });
  }).pipe(Effect.scoped),
);
