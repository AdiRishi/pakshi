import { Scope } from "@repo/contracts/access";
import { DraftName } from "@repo/contracts/draft";
import {
  BlockId,
  BrandId,
  DraftId,
  MediaId,
  ReleaseId,
  SiteId,
  SnapshotId,
  SubmissionId,
} from "@repo/contracts/ids";
import { ConflictKey, Resolutions } from "@repo/contracts/merge";
import { Batch } from "@repo/contracts/ops";
import { SettingsChanges, SiteName } from "@repo/contracts/settings";
import { DraftSharing } from "@repo/contracts/sharing";
import { Decision, Hostname, SiteAddress } from "@repo/contracts/studio";
import { Workflow } from "@repo/contracts/workflow";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { type Effect, Schema } from "effect";

import { studio } from "@/server/studio";
import { callStudio, type StudioClient } from "@/server/studio-rpc";

const forSite = Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId }));
const forDraft = Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId, draft: DraftId }));

/** Calls studio-api for a suggestion, which waits on a model, so it gets longer to answer. */
const suggestion = <A, E>(use: (client: StudioClient) => Effect.Effect<A, E>) =>
  callStudio({ binding: env.STUDIO_RPC, request: getRequest(), timeout: "90 seconds" }, use);

/** Deletes a site. It stops serving at once. */
export const deleteSite = createServerFn({ method: "POST" })
  .validator(forSite)
  .handler(({ data }) => studio((client) => client.deleteSite(data)));

/** The sites deleted in the last 30 days, for an org admin. */
export const getDeletedSites = createServerFn({ method: "GET" }).handler(() =>
  studio((client) => client.deletedSites()),
);

export const restoreSite = createServerFn({ method: "POST" })
  .validator(forSite)
  .handler(({ data }) => studio((client) => client.restoreSite(data)));

/** A site's Pakshi address and its own domains. */
export const getSiteDomains = createServerFn({ method: "GET" })
  .validator(forSite)
  .handler(({ data }) => studio((client) => client.siteDomains(data)));

export const addDomain = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId, hostname: Hostname })))
  .handler(({ data }) => studio((client) => client.addDomain(data)));

/** Checks a site's waiting domains now. */
export const checkDomains = createServerFn({ method: "POST" })
  .validator(forSite)
  .handler(({ data }) => studio((client) => client.checkDomains(data)));

export const removeDomain = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId, hostname: Schema.String })))
  .handler(({ data }) => studio((client) => client.removeDomain(data)));

/** A site's settings, with the images it can choose from. */
export const getSiteSettings = createServerFn({ method: "GET" })
  .validator(forSite)
  .handler(({ data }) => studio((client) => client.siteSettings(data)));

/** Saves some of a site's settings, as of the settings revision the person started from. */
export const saveSiteSettings = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({ site: SiteId, changes: SettingsChanges, seen: Schema.Int }),
    ),
  )
  .handler(({ data }) => studio((client) => client.saveSiteSettings(data)));

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

/** A merged value Pakshi suggests for a text conflict in a draft's update, or null. */
export const suggestMerge = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({ site: SiteId, draft: DraftId, conflict: ConflictKey }),
    ),
  )
  .handler(({ data }) => suggestion((client) => client.suggestMerge(data)));

/** Alt text Pakshi suggests for an image a block of the draft places, or null. */
export const suggestAltText = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({ site: SiteId, draft: DraftId, media: MediaId, block: BlockId }),
    ),
  )
  .handler(({ data }) => suggestion((client) => client.suggestAltText(data)));

/** A behind draft's merge with the live release, with the sides chosen so far. */
export const getDraftUpdate = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({ site: SiteId, draft: DraftId, resolutions: Resolutions }),
    ),
  )
  .handler(({ data }) => studio((client) => client.draftUpdate(data)));

/** Merges the live release into a draft, once every conflict has a side chosen seeing that release. */
export const updateDraft = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({ site: SiteId, draft: DraftId, resolutions: Resolutions, seen: ReleaseId }),
    ),
  )
  .handler(({ data }) => studio((client) => client.updateDraft(data)));

/** What submitting a draft now would meet: what the checks found, and who reviews it. */
export const getSubmissionCheck = createServerFn({ method: "GET" })
  .validator(forDraft)
  .handler(({ data }) => studio((client) => client.submissionCheck(data)));

const Note = Schema.String.check(Schema.isMaxLength(1000));

/**
 * Freezes a draft for approval, or makes it live when the site's workflow
 * has no steps. Writing its snapshot can take a while on a large site.
 */
export const submitDraft = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId, draft: DraftId, note: Note })))
  .handler(({ data }) =>
    callStudio(
      { binding: env.STUDIO_RPC, request: getRequest(), timeout: "60 seconds" },
      (client) => client.submitDraft(data),
    ),
  );

export const getDraftSharing = createServerFn({ method: "GET" })
  .validator(forDraft)
  .handler(({ data }) => studio((client) => client.draftSharing(data)));

export const shareDraft = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({ site: SiteId, draft: DraftId, sharing: DraftSharing }),
    ),
  )
  .handler(({ data }) => studio((client) => client.shareDraft(data)));

/** People in the organization whose name or email contains the text. */
export const searchPeople = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ search: Schema.String })))
  .handler(({ data }) => studio((client) => client.people(data)));

/** Where a site is, what's live, and what waits in the tabs the person may open. */
export const getSiteOverview = createServerFn({ method: "GET" })
  .validator(forSite)
  .handler(({ data }) => studio((client) => client.siteOverview(data)));

/** Every release of a site, newest first. */
export const getSiteReleases = createServerFn({ method: "GET" })
  .validator(forSite)
  .handler(({ data }) => studio((client) => client.siteReleases(data)));

/** Undoes the latest publish. Submissions under review merge the change in, which can take a while. */
export const rollBack = createServerFn({ method: "POST" })
  .validator(forSite)
  .handler(({ data }) =>
    callStudio(
      { binding: env.STUDIO_RPC, request: getRequest(), timeout: "60 seconds" },
      (client) => client.rollBack(data),
    ),
  );

/** Starts a draft holding an earlier release's content. */
export const restoreRelease = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId, release: ReleaseId, name: DraftName })),
  )
  .handler(({ data }) => studio((client) => client.restoreRelease(data)));

const forScope = Schema.toStandardSchemaV1(Schema.Struct({ scope: Scope }));

/** A scope's approval workflow, and the one it uses when it has none of its own. */
export const getWorkflow = createServerFn({ method: "GET" })
  .validator(forScope)
  .handler(({ data }) => studio((client) => client.workflow(data)));

/** Sets a scope's own workflow, or with null, has it use the one above it. */
export const saveWorkflow = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(Schema.Struct({ scope: Scope, steps: Schema.NullOr(Workflow) })),
  )
  .handler(({ data }) => studio((client) => client.saveWorkflow(data)));

/** What waits for the signed-in person's decision, what they sent, and what's finished. */
export const getApprovals = createServerFn({ method: "GET" }).handler(() =>
  studio((client) => client.approvals()),
);

/** What waits for the signed-in person, and the drafts shared with them. */
export const getHome = createServerFn({ method: "GET" }).handler(() =>
  studio((client) => client.home()),
);

const forSubmission = { site: SiteId, submission: SubmissionId };

export const getReview = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct(forSubmission)))
  .handler(({ data }) => studio((client) => client.review(data)));

/** Approves a submission's current step, or requests changes. The last approval publishes it. */
export const decide = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({ ...forSubmission, snapshot: SnapshotId, decision: Decision, note: Note }),
    ),
  )
  .handler(({ data }) =>
    callStudio(
      { binding: env.STUDIO_RPC, request: getRequest(), timeout: "60 seconds" },
      (client) => client.decide(data),
    ),
  );

/** The brands the person may make a site in, and the host its address goes under. */
export const getNewSiteOptions = createServerFn({ method: "GET" }).handler(() =>
  studio((client) => client.newSiteOptions()),
);

/** Makes a site with its platform subdomain and first draft. */
export const createSite = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({ brand: BrandId, name: SiteName, address: SiteAddress }),
    ),
  )
  .handler(({ data }) => studio((client) => client.createSite(data)));
