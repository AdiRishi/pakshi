import { DraftName } from "@repo/contracts/draft";
import { DraftId, ReleaseId, SiteId } from "@repo/contracts/ids";
import { Resolutions } from "@repo/contracts/merge";
import { Batch } from "@repo/contracts/ops";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { type Effect, Schema } from "effect";

import { callStudio, type StudioClient } from "@/server/studio-rpc";

const forSite = Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId }));
const forDraft = Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId, draft: DraftId }));

/** Calls studio-api for the request this server function serves. */
const studio = <A, E>(use: (client: StudioClient) => Effect.Effect<A, E>) =>
  callStudio({ binding: env.STUDIO_RPC, request: getRequest() }, use);

/** A site's drafts, with the release that's live. */
export const getSiteDrafts = createServerFn({ method: "GET" })
  .validator(forSite)
  .handler(({ data }) => studio((client) => client.siteDrafts(data)));

/** Starts a draft of what's live. */
export const createDraft = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId, name: DraftName })))
  .handler(({ data }) => studio((client) => client.createDraft(data)));

export const renameDraft = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId, draft: DraftId, name: DraftName })),
  )
  .handler(({ data }) => studio((client) => client.renameDraft(data)));

/** Closes a draft without publishing it. */
export const closeDraft = createServerFn({ method: "POST" })
  .validator(forDraft)
  .handler(({ data }) => studio((client) => client.closeDraft(data)));

/** A draft's pages and posts. */
export const getDraftPages = createServerFn({ method: "GET" })
  .validator(forDraft)
  .handler(({ data }) => studio((client) => client.draftPages(data)));

/** A draft for the editor, brought up to date first when that needs no one. */
export const openDraft = createServerFn({ method: "GET" })
  .validator(forDraft)
  .handler(({ data }) => studio((client) => client.openDraft(data)));

/** Sends a batch of edit operations to a draft. */
export const applyBatch = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId, draft: DraftId, batch: Batch })),
  )
  .handler(({ data }) => studio((client) => client.applyBatch(data)));

/** A behind draft's merge with the live release, with the sides chosen so far. */
export const getDraftUpdate = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({ site: SiteId, draft: DraftId, resolutions: Resolutions }),
    ),
  )
  .handler(({ data }) => studio((client) => client.draftUpdate(data)));

/** Merges the live release into a draft, once every conflict has a side. */
export const updateDraft = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({ site: SiteId, draft: DraftId, resolutions: Resolutions }),
    ),
  )
  .handler(({ data }) => studio((client) => client.updateDraft(data)));

/** Freezes a draft and makes it live. Writing its snapshot can take a while on a large site. */
export const publishDraft = createServerFn({ method: "POST" })
  .validator(forDraft)
  .handler(({ data }) =>
    callStudio(
      { binding: env.STUDIO_RPC, request: getRequest(), timeout: "60 seconds" },
      (client) => client.publishDraft(data),
    ),
  );

/** Every release of a site, newest first. */
export const getSiteReleases = createServerFn({ method: "GET" })
  .validator(forSite)
  .handler(({ data }) => studio((client) => client.siteReleases(data)));

/** Undoes the latest publish. */
export const rollBack = createServerFn({ method: "POST" })
  .validator(forSite)
  .handler(({ data }) => studio((client) => client.rollBack(data)));

/** Starts a draft holding an earlier release's content. */
export const restoreRelease = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId, release: ReleaseId, name: DraftName })),
  )
  .handler(({ data }) => studio((client) => client.restoreRelease(data)));
