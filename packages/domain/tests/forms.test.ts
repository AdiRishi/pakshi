import { FormEntry } from "@repo/contracts/entries";
import { FormDefinition } from "@repo/contracts/form";
import { Schema } from "effect";
import { describe, expect, test } from "vitest";

import { entriesCsv, readEntry } from "../src/forms.ts";

const booking = Schema.decodeSync(FormDefinition)({
  id: "frm_booking",
  name: "Room booking",
  submitLabel: "Book",
  fields: [
    { kind: "shortText", id: "ff_name", label: "Your name", required: true },
    { kind: "email", id: "ff_email", label: "Email", required: true },
    { kind: "phone", id: "ff_phone", label: "Phone", required: false },
    { kind: "select", id: "ff_room", label: "Room", required: true, options: ["Hall", "Studio"] },
    { kind: "longText", id: "ff_notes", label: "Anything else", required: false },
    {
      kind: "checkbox",
      id: "ff_consent",
      label: "I agree to the privacy policy",
      required: true,
      link: "https://example.org/privacy",
    },
    { kind: "hidden", id: "ff_source", label: "Source", value: "spring-poster" },
  ],
});

const post = (answers: Readonly<Record<string, string>>) => (field: string) =>
  answers[field] ?? null;

describe("reading a form post", () => {
  test("keeps each answer with its field's label, and the visitor's address", () => {
    const read = readEntry(
      booking,
      post({
        ff_name: "  Ama Mensah ",
        ff_email: "Ama@Example.org",
        ff_room: "Hall",
        ff_consent: "on",
        ff_source: "something else",
      }),
    );
    expect(read).toEqual({
      ok: true,
      email: "ama@example.org",
      fields: [
        { id: "ff_name", label: "Your name", value: "Ama Mensah" },
        { id: "ff_email", label: "Email", value: "Ama@Example.org" },
        { id: "ff_phone", label: "Phone", value: "" },
        { id: "ff_room", label: "Room", value: "Hall" },
        { id: "ff_notes", label: "Anything else", value: "" },
        { id: "ff_consent", label: "I agree to the privacy policy", value: "Yes" },
        { id: "ff_source", label: "Source", value: "spring-poster" },
      ],
    });
  });

  test("lists every answer that needs another look", () => {
    const read = readEntry(
      booking,
      post({ ff_email: "not an address", ff_phone: "call me", ff_room: "Roof" }),
    );
    expect(read.ok ? [] : read.issues.map(({ field, message }) => [field, message])).toEqual([
      ["ff_name", "Answer this question"],
      ["ff_email", "Enter an email address"],
      ["ff_phone", "Enter a phone number"],
      ["ff_room", "Choose one of the options"],
      ["ff_consent", "Tick this box to send the form"],
    ]);
  });

  test("refuses an answer longer than its field takes", () => {
    const read = readEntry(
      booking,
      post({
        ff_name: "a".repeat(501),
        ff_email: "ama@example.org",
        ff_room: "Hall",
        ff_consent: "on",
      }),
    );
    expect(read.ok ? [] : read.issues).toEqual([
      { field: "ff_name", label: "Your name", message: "Use at most 500 characters" },
    ]);
  });
});

describe("exporting entries", () => {
  const entry = (
    id: string,
    receivedAt: string,
    fields: ReadonlyArray<readonly [string, string, string]>,
  ) =>
    Schema.decodeSync(FormEntry)({
      id,
      form: "frm_booking",
      formName: "Room booking",
      page: "/visit",
      email: null,
      receivedAt,
      fields: fields.map(([field, label, value]) => ({ id: field, label, value })),
    });

  test("heads each field's column with its newest label, and leaves unanswered cells empty", () => {
    const csv = entriesCsv([
      entry("ent_one", "2027-03-01T09:00:00.000Z", [
        ["ff_name", "Name", "Ama"],
        ["ff_room", "Room", "Hall"],
      ]),
      entry("ent_two", "2027-03-02T09:00:00.000Z", [
        ["ff_name", "Your name", "Kofi"],
        ["ff_notes", "Anything else", "Two tables, please"],
      ]),
    ]);
    expect(csv.split("\r\n")).toEqual([
      "Received,Page,Your name,Room,Anything else",
      "2027-03-01T09:00:00.000Z,/visit,Ama,Hall,",
      '2027-03-02T09:00:00.000Z,/visit,Kofi,,"Two tables, please"',
    ]);
  });

  test("keeps a spreadsheet from running a formula someone typed", () => {
    const csv = entriesCsv([
      entry("ent_one", "2027-03-01T09:00:00.000Z", [["ff_name", "Name", '=HYPERLINK("x")']]),
    ]);
    expect(csv.split("\r\n")[1]).toBe('2027-03-01T09:00:00.000Z,/visit,"\'=HYPERLINK(""x"")"');
  });
});
