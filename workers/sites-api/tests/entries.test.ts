import { SqliteClient } from "@effect/sql-sqlite-node";
import { describe, expect, it } from "@effect/vitest";
import { NewEntry } from "@repo/contracts/entries";
import { SiteId } from "@repo/contracts/ids";
import { LiveSettings } from "@repo/contracts/settings";
import { Effect, Layer, Schema } from "effect";
import * as Migrator from "effect/unstable/sql/Migrator";

import { type EntryEmail, migrations, SiteEntries } from "../src/entries.ts";

const storage = Layer.effectDiscard(Migrator.make({})({ loader: migrations })).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" })),
);

const withEntries = <A, E>(test: (entries: SiteEntries["Service"]) => Effect.Effect<A, E>) =>
  SiteEntries.use(test).pipe(Effect.provide(SiteEntries.layer.pipe(Layer.provide(storage))));

const site = { id: SiteId.make("site_northbank"), name: "Northbank Libraries" };

const booking = Schema.decodeSync(NewEntry)({
  form: "frm_booking",
  formName: "Room booking",
  page: "/visit",
  email: "ama@example.org",
  fields: [{ id: "ff_name", label: "Your name", value: "Ama Mensah" }],
});

const emailingRooms = Schema.decodeSync(LiveSettings)({
  formEmails: { frm_booking: ["rooms@riverton.test"] },
});

describe("new entry emails", () => {
  it.effect("go to the form's addresses, linking to the entry in Studio", () =>
    withEntries((entries) =>
      Effect.gen(function* () {
        yield* entries.configure(emailingRooms, "https://studio.riverton.test");
        const { entry } = yield* entries.receive(site, booking);
        const sent: Array<EntryEmail> = [];
        const next = yield* entries.sendDue(async (email) => void sent.push(email));
        expect(next).toBeNull();
        expect(sent).toEqual([
          expect.objectContaining({
            to: ["rooms@riverton.test"],
            subject: "New entry: Room booking, Northbank Libraries",
          }),
        ]);
        expect(sent[0]?.text).toContain(
          `https://studio.riverton.test/sites/site_northbank/submissions/${entry.id}`,
        );
        expect(sent[0]?.text).not.toContain("Ama");
      }),
    ),
  );

  it.effect("that fail to send wait to be tried again, and aren't lost", () =>
    withEntries((entries) =>
      Effect.gen(function* () {
        yield* entries.configure(emailingRooms, "https://studio.riverton.test");
        yield* entries.receive(site, booking);
        const next = yield* entries.sendDue(() =>
          Promise.reject(new Error("Email Service is down")),
        );
        expect(next).toBeGreaterThan(Date.now());
        // Not due yet, so nothing is sent until the retry.
        const sent: Array<EntryEmail> = [];
        yield* entries.sendDue(async (email) => void sent.push(email));
        expect(sent).toEqual([]);
      }),
    ),
  );

  it.effect("aren't queued for a form whose entries go nowhere", () =>
    withEntries((entries) =>
      Effect.gen(function* () {
        yield* entries.configure({ formEmails: {} }, "https://studio.riverton.test");
        expect((yield* entries.receive(site, booking)).notify).toBe(false);
      }),
    ),
  );
});

describe("deleting everything for one person", () => {
  it.effect("finds their entries by the address they gave, whatever its case", () =>
    withEntries((entries) =>
      Effect.gen(function* () {
        yield* entries.receive(site, booking);
        yield* entries.receive(site, { ...booking, email: null });
        expect(yield* entries.removeFor("AMA@example.org")).toBe(1);
        const left = yield* entries.entries({ form: booking.form, before: null, limit: 10 });
        expect(left.map((entry) => entry.email)).toEqual([null]);
      }),
    ),
  );
});
