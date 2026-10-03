import { EmailAddress } from "@repo/contracts/email";
import type { EntryField, EntryIssue, FormEntry } from "@repo/contracts/entries";
import { answerProblem, type FormDefinition } from "@repo/contracts/form";
import type { FormFieldId } from "@repo/contracts/ids";
import { Option, Schema } from "effect";

import { csv } from "./csv.ts";

const decodeEmail = Schema.decodeOption(EmailAddress);

/*
 * How a form post becomes an entry. Visitors' forms check each answer before
 * sending, but a post can come from anywhere, so the answers are checked
 * again against the form the live release has.
 */

export type ReadEntry =
  | {
      readonly ok: true;
      readonly fields: ReadonlyArray<EntryField>;
      /** The first email address the entry gives, which finds it when someone asks for their data. */
      readonly email: EmailAddress | null;
    }
  | { readonly ok: false; readonly issues: ReadonlyArray<EntryIssue> };

/**
 * Reads a post's answers for a form: each field's value with its label, or
 * every answer that needs another look. `posted` gives what the post sent
 * for a field, or null when it sent nothing. A hidden field always takes the
 * form's own value, whatever was posted.
 */
export const readEntry = (
  form: FormDefinition,
  posted: (field: FormFieldId) => string | null,
): ReadEntry => {
  const fields: Array<EntryField> = [];
  const issues: Array<EntryIssue> = [];
  for (const field of form.fields) {
    if (field.kind === "hidden") {
      fields.push({ id: field.id, label: field.label, value: field.value });
      continue;
    }
    const sent = posted(field.id);
    const value = field.kind === "checkbox" ? (sent === null ? "" : "Yes") : (sent ?? "").trim();
    const problem = answerProblem(field, value);
    if (problem !== null) issues.push({ field: field.id, label: field.label, message: problem });
    else
      fields.push({
        id: field.id,
        label: field.label,
        value: field.kind === "checkbox" && value === "" ? "No" : value,
      });
  }
  if (issues.length > 0) return { ok: false, issues };
  const email = form.fields.flatMap((field) => {
    if (field.kind !== "email") return [];
    const answer = fields.find((found) => found.id === field.id)?.value ?? "";
    return Option.toArray(decodeEmail(answer.toLowerCase()));
  })[0];
  return { ok: true, fields, email: email ?? null };
};

/**
 * A form's entries as CSV, oldest first: when each came, the page it came
 * from, and a column per field any entry answered. A field's column is headed
 * with the label it had in the newest entry that answered it.
 */
export const entriesCsv = (entries: ReadonlyArray<FormEntry>) => {
  const labels = new Map<FormFieldId, string>();
  for (const entry of entries) for (const field of entry.fields) labels.set(field.id, field.label);
  const columns = Array.from(labels.keys());
  const rows = [
    ["Received", "Page", ...columns.map((id) => labels.get(id) ?? id)],
    ...entries.map((entry) => [
      entry.receivedAt,
      entry.page,
      ...columns.map((id) => entry.fields.find((field) => field.id === id)?.value ?? ""),
    ]),
  ];
  return csv(rows);
};
