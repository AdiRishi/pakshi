import { expect, it } from "@effect/vitest";
import { entryLimit, intakePath } from "@repo/contracts/entries";
import { FormDefinition } from "@repo/contracts/form";
import { BlockId, EntryId, FormId, randomId, type SiteId } from "@repo/contracts/ids";
import { env } from "cloudflare:workers";
import { Effect, Schema } from "effect";

import { edit, newSite, publish, readyPage } from "./support/sites.ts";
import { emailArriving, join, linkIn, setUp, studio } from "./support/studio.ts";

const admin = Effect.cached(
  setUp({
    organization: "Riverton Council",
    name: "Priya Shah",
    email: "priya@riverton.test",
    password: "priya-password",
  }),
).pipe(Effect.runSync);

const booking = FormId.make("frm_booking");

/** A form asking for a name and email, with the consent checkbox pre-flight wants. */
const bookingForm = Schema.decodeSync(FormDefinition)({
  id: booking,
  name: "Room booking",
  submitLabel: "Book",
  fields: [
    { kind: "shortText", id: "ff_name", label: "Your name", required: true },
    { kind: "email", id: "ff_email", label: "Email", required: true },
    {
      kind: "checkbox",
      id: "ff_consent",
      label: "I agree to the privacy policy",
      required: true,
      link: "https://riverton.test/privacy",
    },
  ],
});

/** Posts a form the way `sites` forwards a visitor's post. */
const post = (site: SiteId, body: string) =>
  Effect.promise(() =>
    env.SITES_API.fetch(
      new Request(`https://sites-api.pakshi.test${intakePath}/${site}/${booking}?page=/`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      }),
    ),
  );

const answers = (name: string, email: string) =>
  new URLSearchParams({ ff_name: name, ff_email: email, ff_consent: "on" }).toString();

it.live(
  "a form publishes once its entries go somewhere, and each entry is stored, emailed about, exported and deleted on request",
  () =>
    Effect.gen(function* () {
      const priya = yield* studio(yield* admin);
      const site = yield* newSite(priya, "Northbank Libraries", "northbank");
      yield* edit(priya, site.site, site.draft, [
        ...readyPage(site.home, "Welcome"),
        { op: "setForm", form: bookingForm },
        {
          op: "insertBlock",
          page: site.home,
          list: "root",
          after: null,
          block: {
            id: BlockId.make(randomId("b")),
            type: "form-section",
            variant: "card",
            surface: "default",
            props: { heading: "Book a room", form: { $ref: "form", id: booking } },
          },
        },
      ]);
      const blocked = yield* priya.submitDraft({ site: site.site, draft: site.draft, note: "" });
      expect(blocked).toMatchObject({
        _tag: "Blocked",
        issues: [{ _tag: "NoFormEmails", form: booking }],
      });

      const settings = yield* priya.siteSettings({ site: site.site });
      expect(settings.forms).toEqual([
        { id: booking, name: "Room booking", pages: ["Northbank Libraries"], live: false },
      ]);
      yield* priya.saveSiteSettings({
        site: site.site,
        changes: { formEmails: { [booking]: ["rooms@riverton.test"] } },
        seen: settings.revision,
      });
      yield* publish(priya, site.site, site.draft);

      const refused = yield* post(site.site, answers("", "not an address"));
      expect(refused.status).toBe(422);
      const tooLarge = yield* post(site.site, answers("x".repeat(entryLimit), "ama@example.org"));
      expect(tooLarge.status).toBe(413);

      expect((yield* post(site.site, answers("Ama Mensah", "Ama@Example.org"))).status).toBe(200);
      const email = yield* emailArriving("rooms@riverton.test", "New entry: Room booking");
      expect(email.text).not.toContain("Ama");
      const link = new URL(linkIn(email.text));
      const entry = yield* Schema.decodeUnknownEffect(EntryId)(link.pathname.split("/").at(-1));

      const { forms } = yield* priya.siteEntries({ site: site.site });
      expect(forms).toMatchObject([{ id: booking, entries: 1 }]);
      const shown = yield* priya.formEntry({ site: site.site, entry });
      expect(shown.fields.map(({ label, value }) => [label, value])).toEqual([
        ["Your name", "Ama Mensah"],
        ["Email", "Ama@Example.org"],
        ["I agree to the privacy policy", "Yes"],
      ]);
      const { csv } = yield* priya.exportEntries({ site: site.site, form: booking });
      expect(csv.split("\r\n")).toHaveLength(2);
      expect(csv).toContain("Ama Mensah");

      expect(yield* priya.deleteEntriesFor({ site: site.site, email: "ama@example.org" })).toEqual({
        deleted: 1,
      });
      const left = yield* priya.formEntries({
        site: site.site,
        form: booking,
        search: null,
        before: null,
      });
      expect(left.entries).toEqual([]);
    }),
);

it.live("an editor can't read a site's form entries", () =>
  Effect.gen(function* () {
    const priya = yield* studio(yield* admin);
    const site = yield* newSite(priya, "Riverside Parks", "parks");
    const sam = yield* studio(
      yield* join(priya, { name: "Sam Okafor", email: "sam@riverton.test" }, "editor", {
        kind: "site",
        id: site.site,
      }),
    );
    const refused = yield* Effect.flip(sam.siteEntries({ site: site.site }));
    expect(refused._tag).toBe("NotPermitted");
  }),
);
