import { EmailAddress } from "@repo/contracts/email";
import { EntryId, FormId, SiteId } from "@repo/contracts/ids";
import { EntryCursor } from "@repo/contracts/studio";
import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { studio } from "@/server/studio";

const forEntry = Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId, entry: EntryId }));
const forPerson = Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId, email: EmailAddress }));

/** A site's forms with how many entries each has. */
export const getSiteEntries = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId })))
  .handler(({ data }) => studio((client) => client.siteEntries(data)));

export const getFormEntries = createServerFn({ method: "GET" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({
        site: SiteId,
        form: FormId,
        search: Schema.NullOr(Schema.String),
        before: Schema.NullOr(EntryCursor),
      }),
    ),
  )
  .handler(({ data }) => studio((client) => client.formEntries(data)));

export const getFormEntry = createServerFn({ method: "GET" })
  .validator(forEntry)
  .handler(({ data }) => studio((client) => client.formEntry(data)));

export const deleteEntry = createServerFn({ method: "POST" })
  .validator(forEntry)
  .handler(({ data }) => studio((client) => client.deleteEntry(data)));

/** How many entries an address sent with each form, shown before deleting them. */
export const getEntriesFrom = createServerFn({ method: "GET" })
  .validator(forPerson)
  .handler(({ data }) => studio((client) => client.entriesFrom(data)));

export const deleteEntriesFor = createServerFn({ method: "POST" })
  .validator(forPerson)
  .handler(({ data }) => studio((client) => client.deleteEntriesFor(data)));
