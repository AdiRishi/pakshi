import { Context, Schema } from "effect";
import { Rpc, RpcGroup, RpcMiddleware } from "effect/unstable/rpc";

import { Draft } from "./draft.ts";
import { DraftId, MediaId, PageId, SiteId } from "./ids.ts";
import { Batch, BatchError } from "./ops.ts";
import { PagePath } from "./page.ts";
import { MediaFile } from "./snapshot.ts";

/** Better Auth's ID for the organization's identity provider, used by sign-in on both sides. */
export const identityProviderId = "organization";

/** The person a Studio request is made for. */
export const Person = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
});
export type Person = typeof Person.Type;

/** Nobody is signed in, or their session has expired. */
export class Unauthenticated extends Schema.TaggedError<Unauthenticated>()("Unauthenticated", {}) {}

/** studio-api couldn't reach its storage. The caller may try again. */
export class StudioUnavailable extends Schema.TaggedError<StudioUnavailable>()(
  "StudioUnavailable",
  { operation: Schema.String },
) {}

/** The signed-in person, which every Studio handler can read. */
export class SignedIn extends Context.Service<SignedIn, Person>()("Pakshi/SignedIn") {}

/**
 * Checks the session cookie Studio forwards and provides the signed-in person.
 * Handlers never take the person or the cookie as an argument.
 */
export class StudioSession extends RpcMiddleware.Service<StudioSession, { provides: SignedIn }>()(
  "Pakshi/StudioSession",
  { error: Schema.Union([Unauthenticated, StudioUnavailable]) },
) {}

/** The headers Studio forwards on every call, for the session middleware. */
export const studioSessionHeaders = { cookie: "cookie", origin: "x-studio-origin" } as const;

export const Viewer = Schema.Struct({
  user: Person,
  roles: Schema.Array(Schema.Struct({ role: Schema.String, scope: Schema.String })),
  sites: Schema.Array(Schema.Struct({ id: SiteId, name: Schema.String, brand: Schema.String })),
});
export type Viewer = typeof Viewer.Type;

/**
 * There's no site with this ID that the person may work on. A site they can't
 * reach looks the same as one that doesn't exist, so IDs reveal nothing.
 */
export class SiteNotFound extends Schema.TaggedError<SiteNotFound>()("SiteNotFound", {
  site: SiteId,
}) {}

/** An image in a site's library, with the alt text suggested for new placements. */
export const MediaSummary = Schema.Struct({
  id: MediaId,
  ...MediaFile.fields,
  alt: Schema.String,
});
export type MediaSummary = typeof MediaSummary.Type;

export const PageSummary = Schema.Struct({
  id: PageId,
  type: Schema.Literals(["page", "post"]),
  path: PagePath,
  title: Schema.String,
});
export type PageSummary = typeof PageSummary.Type;

/** A site's pages and posts, as its draft has them. */
export const SitePages = Schema.Struct({
  site: Schema.Struct({ id: SiteId, name: Schema.String }),
  draft: DraftId,
  pages: Schema.Array(PageSummary),
});
export type SitePages = typeof SitePages.Type;

/** What the editor opens: the draft, and the images it can place. */
export const EditorDraft = Schema.Struct({ draft: Draft, media: Schema.Array(MediaSummary) });
export type EditorDraft = typeof EditorDraft.Type;

/**
 * What became of a batch. A committed batch took the draft to `revision`; a
 * batch sent again reports the revision it committed at the first time.
 */
export const BatchOutcome = Schema.Union([
  Schema.Struct({ status: Schema.Literal("committed"), revision: Schema.Int }),
  Schema.Struct({ status: Schema.Literal("rejected"), errors: Schema.Array(BatchError) }),
]);
export type BatchOutcome = typeof BatchOutcome.Type;

const siteError = Schema.Union([StudioUnavailable, SiteNotFound]);

/** Everything Studio asks of studio-api. */
export class StudioRpcs extends RpcGroup.make(
  Rpc.make("viewer", { success: Viewer, error: StudioUnavailable }),
  Rpc.make("sitePages", { payload: { site: SiteId }, success: SitePages, error: siteError }),
  Rpc.make("editorDraft", { payload: { site: SiteId }, success: EditorDraft, error: siteError }),
  Rpc.make("applyBatch", {
    payload: { site: SiteId, batch: Batch },
    success: BatchOutcome,
    error: siteError,
  }),
).middleware(StudioSession) {}
