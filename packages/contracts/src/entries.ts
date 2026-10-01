import { Schema } from "effect";

import { EmailAddress } from "./email.ts";
import { EntryId, FormFieldId, FormId } from "./ids.ts";
import { PagePath } from "./page.ts";
import { Timestamp } from "./release.ts";

/*
 * What visitors send with a site's forms. Each site's entries live in its
 * own SiteSubmissions Durable Object, apart from every other site's.
 */

/** The largest form post sites-api accepts, in bytes. */
export const entryLimit = 64 * 1024;

/** One answer, with the label its field had when the entry was sent, so old entries still read correctly. */
export const EntryField = Schema.Struct({
  id: FormFieldId,
  label: Schema.String,
  value: Schema.String,
});
export type EntryField = typeof EntryField.Type;

/** An entry before SiteSubmissions stores it. */
export const NewEntry = Schema.Struct({
  form: FormId,
  formName: Schema.String,
  /** The page the form was sent from. */
  page: PagePath,
  /** The address the visitor gave, which deleting everything for one person finds entries by. */
  email: Schema.NullOr(EmailAddress),
  fields: Schema.Array(EntryField),
});
export type NewEntry = typeof NewEntry.Type;

export const FormEntry = Schema.Struct({
  id: EntryId,
  ...NewEntry.fields,
  receivedAt: Timestamp,
});
export type FormEntry = typeof FormEntry.Type;

/** Why sites-api refused an answer. */
export const EntryIssue = Schema.Struct({
  field: FormFieldId,
  label: Schema.String,
  message: Schema.String,
});
export type EntryIssue = typeof EntryIssue.Type;

/** What sites-api did with a form post. */
export const Intake = Schema.TaggedUnion({
  Received: {},
  Invalid: { issues: Schema.Array(EntryIssue) },
  /** The site's live release has no such form. */
  NoForm: {},
  TooLarge: {},
});
export type Intake = typeof Intake.Type;

/** Where `sites` forwards a form post: `${intakePath}/{site}/{form}?page={path}`. */
export const intakePath = "/forms";

/** A form's entries as Studio lists them, with how many there are. */
export const FormSummary = Schema.Struct({
  id: FormId,
  name: Schema.String,
  entries: Schema.Int,
  latest: Schema.NullOr(Timestamp),
});
export type FormSummary = typeof FormSummary.Type;
