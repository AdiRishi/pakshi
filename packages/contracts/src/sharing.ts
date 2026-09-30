import { Schema } from "effect";

import { Collaborator } from "./live.ts";

/** What a share lets someone do with a draft. Neither includes submitting or publishing. */
export const ShareAccess = Schema.Literals(["view", "edit"]);
export type ShareAccess = typeof ShareAccess.Type;

/** Who can open a draft beyond the people it's shared with: no one else, everyone in the organization, or anyone with the link. */
export const Audience = Schema.Literals(["people", "organization", "link"]);
export type Audience = typeof Audience.Type;

/**
 * How a draft is shared. People who may edit the site's pages can open every
 * draft; sharing adds access to one draft for anyone else.
 */
export const DraftSharing = Schema.Struct({
  people: Schema.Array(
    Schema.Struct({
      person: Schema.Struct({ ...Collaborator.fields, email: Schema.String }),
      access: ShareAccess,
    }),
  ),
  general: Schema.Struct({ audience: Audience, access: ShareAccess }),
});
export type DraftSharing = typeof DraftSharing.Type;

/** A draft shared with no one. */
export const unshared: DraftSharing = {
  people: [],
  general: { audience: "people", access: "view" },
};
