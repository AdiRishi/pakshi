import { D1Client } from "@effect/sql-d1";
import { blockKey, latestLockfile } from "@repo/blocks";
import { renderingChanges } from "@repo/blocks/rendering-changes";
import type { Permission } from "@repo/contracts/access";
import type { Draft } from "@repo/contracts/draft";
import type { BlockType, DraftId, MediaId, SiteId } from "@repo/contracts/ids";
import type { Collaborator } from "@repo/contracts/live";
import { liveReleaseOf, type Release, Timestamp } from "@repo/contracts/release";
import { rpcWebHandler } from "@repo/contracts/rpc/server";
import { publishedOf, type SettingsView } from "@repo/contracts/settings";
import { objectKeys, routingKeys } from "@repo/contracts/snapshot";
import {
  BlocksRemoved,
  CannotDecide,
  type DecisionOutcome,
  DraftNotFound,
  type DraftSummary,
  EntryNotFound,
  ImageNotFound,
  newEntriesDays,
  NothingToRollBack,
  NotPermitted,
  OpenedDraft,
  type Person,
  PreviewPage,
  ReleaseNotFound,
  type ReviewPage,
  SettingsChanged,
  SignedIn,
  type SiteForm,
  type SiteAbilities,
  type SiteView,
  StudioAddress,
  StudioRpcs,
  StudioSession,
  studioSessionHeaders,
  StudioUnavailable,
  SubmissionNotFound,
  type SubmitOutcome,
  Unauthenticated,
  type UpdateOutcome,
  UpToDate,
  Visitor,
  VisitorSession,
} from "@repo/contracts/studio";
import type { Submission } from "@repo/contracts/submission";
import { authorize } from "@repo/domain/access";
import { eligibility } from "@repo/domain/approvals";
import { entriesCsv } from "@repo/domain/forms";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Cause, Effect, Layer, Option, Schedule, Schema } from "effect";
import { type SqlError, SqlClient } from "effect/unstable/sql";
import { getServerByName } from "partyserver";

import { describeScope, loadAccess } from "./access.ts";
import { altTextSuggestion, mergeSuggestion } from "./agent/suggestions.ts";
import { audit, auditFilters, auditLog, exportAudit } from "./audit.ts";
import { authFor } from "./auth.ts";
import { blockRequests, closeBlockRequest, requestBlock } from "./block-requests.ts";
import { blockTitle, newerVersions, removableVersions } from "./blocks.ts";
import { offerRevision } from "./brand-updates.ts";
import {
  brandsFor,
  brandView,
  createBrand,
  latestRevision,
  pinnedRevision,
  saveLook,
  saveVoice,
} from "./brands.ts";
import { deleteBrand, deletedSites, deleteSite, restoreSite } from "./deletion.ts";
import {
  addDomain,
  checkDomains,
  removeDomain,
  routedHost,
  siteAddress,
  siteDomains,
} from "./domains.ts";
import { acceptInvitation, invitationView, invite, revokeInvitation } from "./invitations.ts";
import { findPeople, finishedFor, sentBy, sharedWith, waitingFor } from "./lists.ts";
import { LiveAccess } from "./live-access.ts";
import {
  changeRoleOf,
  grantRoleTo,
  peopleView,
  removeAllAccessOf,
  removeOverrideFor,
  revokeRoleFrom,
  scopeMembers,
  setOverrideFor,
} from "./members.ts";
import { successMetrics } from "./metrics.ts";
import { mailerFor } from "./notifications.ts";
import { organizationName } from "./organization.ts";
import { deleteRole, rolesView, saveRole } from "./roles.ts";
import type { Outcome, SiteDocError } from "./site-doc.ts";
import type { BatchResult } from "./site/drafts.ts";
import type {
  BlockInUse,
  DraftView,
  Opened,
  SubmissionReview,
  UpdatePreview,
} from "./site/site.ts";
import {
  approverOn,
  brandsForNewSites,
  createSite,
  findSite,
  inSiteLibrary,
  libraryImages,
  libraryOf,
  siteFor,
  siteMedia,
  siteOf,
  sitesOf,
  standingOn,
} from "./sites.ts";
import { describeViewer } from "./viewer.ts";
import { saveWorkflow, siteWorkflow, workflowView } from "./workflows.ts";

const unavailable = (operation: string) => (cause: Cause.YieldableError) =>
  Effect.logError(`studio-api ${operation} failed`, cause).pipe(
    Effect.andThen(Effect.fail(new StudioUnavailable({ operation }))),
  );

/** The person a request's forwarded session cookie belongs to, or null when there's none. */
const sessionPerson = (env: StudioApiEnv, headers: Readonly<Record<string, string | undefined>>) =>
  Effect.gen(function* () {
    const origin = headers[studioSessionHeaders.origin];
    const cookie = headers[studioSessionHeaders.cookie];
    if (origin === undefined) return { origin: "", person: null };
    if (cookie === undefined) return { origin, person: null };
    const found = yield* Effect.tryPromise(() =>
      authFor(env, origin).api.getSession({ headers: new Headers({ cookie }) }),
    ).pipe(Effect.catch(unavailable("session check")));
    if (found === null) return { origin, person: null };
    const { id, name, email } = found.user;
    return { origin, person: { id, name, email } satisfies Person };
  });

const sessions = (env: StudioApiEnv) =>
  Layer.mergeAll(
    Layer.succeed(StudioSession)(
      StudioSession.of((effect, { headers }) =>
        Effect.gen(function* () {
          const { origin, person } = yield* sessionPerson(env, headers);
          if (person === null) return yield* new Unauthenticated({});
          return yield* effect.pipe(
            Effect.provideService(SignedIn, person),
            Effect.provideService(StudioAddress, origin),
          );
        }),
      ),
    ),
    Layer.succeed(VisitorSession)(
      VisitorSession.of((effect, { headers }) =>
        Effect.gen(function* () {
          const { origin, person } = yield* sessionPerson(env, headers);
          return yield* effect.pipe(
            Effect.provideService(Visitor, person),
            Effect.provideService(StudioAddress, origin),
          );
        }),
      ),
    ),
  );

/** The site's SiteDoc, once PartyServer has started it. */
const siteDoc = (env: StudioApiEnv, site: SiteId) =>
  Effect.tryPromise(() => getServerByName(env.SITE_DOC, site));

/**
 * Whether a live page, header or footer shows a block. A release's lockfile
 * pins every block type, used or not.
 */
const isShown = (block: BlockInUse) => block.pages > 0 || block.sitewide;

/** The blocks each site's live release shows. */
const shownBlocks = <Site extends { readonly id: SiteId }>(
  env: StudioApiEnv,
  sites: ReadonlyArray<Site>,
) =>
  Effect.forEach(
    sites,
    (site) =>
      siteDoc(env, site.id).pipe(
        Effect.flatMap((doc) =>
          Effect.tryPromise(async (): Promise<ReadonlyArray<BlockInUse>> => doc.blocksInUse()),
        ),
        Effect.map((inUse) => ({
          site,
          blocks: inUse.filter(isShown),
        })),
      ),
    { concurrency: 10 },
  );

/** Whether a site shows a block at an older version than the registry's newest. */
const isBehind = (block: BlockInUse) =>
  block.version < (latestLockfile[block.type] ?? block.version);

const isOutage = (error: {
  readonly _tag: string;
}): error is SqlError.SqlError | Cause.UnknownError =>
  error._tag === "SqlError" || error._tag === "UnknownError";

const isSchemaError = (error: { readonly _tag: string }): error is Schema.SchemaError =>
  error._tag === "SchemaError";

/**
 * A SiteDoc call's value, or the failure it reported, which must be one the
 * call can report.
 */
const outcome = <A, E extends SiteDocError>(
  failure: Schema.Decoder<E>,
  call: () => Promise<Outcome<A>>,
) =>
  Effect.flatMap(Effect.tryPromise(call), (result) =>
    result.ok
      ? Effect.succeed(result.value)
      : Effect.flatMap(Schema.decodeEffect(failure)(result.error), Effect.fail),
  );

const abilities = (permissions: ReadonlyArray<Permission>): SiteAbilities => ({
  publish: permissions.includes("site.publish"),
  rollBack: permissions.includes("site.rollback"),
  share: permissions.includes("draft.share"),
  upload: permissions.includes("page.edit"),
});

/** How many entries Studio lists at a time. */
const entriesPage = 50;

const collaborator = (person: Person): Collaborator => ({ id: person.id, name: person.name });

const pageSummaries = (draft: Draft) =>
  Object.values(draft.pages)
    .map((page) => ({ id: page.id, type: page.type, path: page.path, title: page.meta.title }))
    .toSorted((a, b) => (a.path < b.path ? -1 : 1));

/** Each site's SiteDoc, told of changes of access. */
const liveAccessOf = (env: StudioApiEnv) =>
  Layer.succeed(LiveAccess)({
    refresh: (site, people) =>
      Effect.tryPromise(async () =>
        (await getServerByName(env.SITE_DOC, site)).refreshPermissions(people),
      ).pipe(Effect.retry({ schedule: Schedule.exponential("100 millis"), times: 3 })),
  });

const handlers = (env: StudioApiEnv) =>
  StudioRpcs.toLayer(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const liveAccess = yield* LiveAccess;
      /** Runs a handler against core, turning storage failures into a retryable error. */
      const withCore =
        (operation: string) =>
        <A, E extends { readonly _tag: string }, R>(
          effect: Effect.Effect<
            A,
            E | SqlError.SqlError | Schema.SchemaError | Cause.UnknownError,
            R | SqlClient.SqlClient | LiveAccess
          >,
        ) =>
          effect.pipe(
            Effect.provideService(SqlClient.SqlClient, sql),
            Effect.provideService(LiveAccess, liveAccess),
            Effect.catchIf(isOutage, unavailable(operation)),
            // A row that doesn't match its schema is a bug, not an outage.
            Effect.catchIf(isSchemaError, Effect.die),
          );
      /** A site the signed-in person may edit, with its SiteDoc. */
      const editable = Effect.fn("StudioRpc.editable")(function* (person: Person, site: SiteId) {
        const found = yield* siteFor(person, site, "page.edit");
        return { found, doc: yield* siteDoc(env, site) };
      });
      /**
       * A draft the signed-in person may edit: every draft on a site whose
       * pages they may edit, or one shared with them for editing. They can't
       * tell a draft they can't edit from one that doesn't exist.
       */
      const editableDraft = Effect.fn("StudioRpc.editableDraft")(function* (
        person: Person,
        site: SiteId,
        draft: DraftId,
      ) {
        const found = yield* findSite(site);
        const standing = yield* standingOn(person, found);
        const doc = yield* siteDoc(env, site);
        const editsSite = standing.permissions.includes("page.edit");
        const access = editsSite
          ? "edit"
          : yield* Effect.tryPromise(() => doc.access(draft, { id: person.id, editsSite }));
        if (access !== "edit") return yield* new DraftNotFound({ draft });
        return { found: { ...found, ...standing }, doc };
      });
      /**
       * A site the signed-in person may take an action on, with its SiteDoc.
       * Someone who holds other permissions there is told they can't do this.
       */
      const permitted = Effect.fn("StudioRpc.permitted")(function* (
        person: Person,
        site: SiteId,
        permission: Permission,
        action: string,
      ) {
        const found = yield* siteOf(person, site);
        if (!found.permissions.includes(permission)) return yield* new NotPermitted({ action });
        return { found, doc: yield* siteDoc(env, site) };
      });
      /** A site's settings as its settings screens show them, to someone who works on it. */
      const settingsView = Effect.fn("StudioRpc.settingsView")(function* (
        site: Effect.Success<ReturnType<typeof siteOf>>,
        view: SettingsView,
      ) {
        // A site's brand outlives it.
        const brand = yield* describeScope({ kind: "brand", id: site.brand }).pipe(
          Effect.catchTag("ScopeNotFound", Effect.die),
        );
        const media = yield* siteMedia(site);
        const doc = yield* siteDoc(env, site.id);
        const forms = yield* Effect.tryPromise(async (): Promise<ReadonlyArray<SiteForm>> =>
          doc.forms(),
        );
        return {
          site: { id: site.id, name: site.name },
          brand: { id: site.brand, name: brand.name },
          ...view,
          media,
          forms,
          can: {
            edit: site.permissions.includes("site.settings.edit"),
            delete: site.permissions.includes("site.delete"),
          },
        };
      });
      /** Writes a proven domain's host to KV, so `sites` serves the site there. */
      const route = (hostname: string, site: SiteId) =>
        Effect.promise(() =>
          env.ROUTING.put(routingKeys.host(routedHost(hostname, env.SITES_HOST)), site),
        );
      /** A site's addresses, to someone who works on it. */
      const domainsView = Effect.fn("StudioRpc.domainsView")(function* (
        site: Effect.Success<ReturnType<typeof siteOf>>,
      ) {
        return {
          site: { id: site.id, name: site.name },
          platform: site.address === null ? null : `${site.address}.${env.SITES_HOST}`,
          domains: yield* siteDomains(site.id, env.SITES_HOST),
          can: { edit: site.permissions.includes("site.settings.edit") },
        };
      });
      /** A site's form entries, in its own SiteSubmissions. */
      const entriesOf = (site: SiteId) => env.SITE_SUBMISSIONS.getByName(site);
      const liveOf = (doc: Effect.Success<ReturnType<typeof siteDoc>>) =>
        Effect.tryPromise(async (): Promise<Release> => doc.live());
      /** What waits in a site's Drafts and Blocks tabs. */
      const editingOf = Effect.fn("StudioRpc.editingOf")(function* (
        doc: Effect.Success<ReturnType<typeof siteDoc>>,
      ) {
        const [drafts, inUse] = yield* Effect.all(
          [
            Effect.tryPromise(async (): Promise<ReadonlyArray<DraftSummary>> => doc.drafts()),
            Effect.tryPromise(async (): Promise<ReadonlyArray<BlockInUse>> => doc.blocksInUse()),
          ],
          { concurrency: "unbounded" },
        );
        const open = drafts.filter((draft) => draft.status === "open");
        const brandUpdate = open.find((draft) => draft.kind._tag === "BrandUpdate");
        return {
          openDrafts: open.length,
          waitingDrafts: open.filter((draft) => draft.review?.status._tag === "InReview").length,
          blockUpdates: inUse.filter((block) => isShown(block) && isBehind(block)).length,
          brandUpdate:
            brandUpdate === undefined ? null : { id: brandUpdate.id, name: brandUpdate.name },
        };
      });

      return StudioRpcs.of({
        viewer: () => SignedIn.use((person) => withCore("viewer")(describeViewer(person))),
        organization: () =>
          withCore("organization")(
            Effect.map(
              organizationName,
              Option.match({ onNone: () => null, onSome: (name) => ({ name }) }),
            ),
          ),
        invitation: ({ token }) => withCore("invitation")(invitationView(token)),
        organizationPeople: () => SignedIn.use((person) => withCore("people")(peopleView(person))),
        auditLog: ({ query, before }) =>
          SignedIn.use((person) => withCore("audit log")(auditLog(person, query, before))),
        auditFilters: () =>
          SignedIn.use((person) => withCore("audit filters")(auditFilters(person))),
        exportAudit: ({ query }) =>
          SignedIn.use((person) => withCore("export audit log")(exportAudit(person, query))),
        successMetrics: ({ since }) =>
          SignedIn.use((person) => withCore("success metrics")(successMetrics(person, since))),
        roles: () => SignedIn.use((person) => withCore("roles")(rolesView(person))),
        saveRole: ({ role, ...details }) =>
          SignedIn.use((person) => withCore("save role")(saveRole(person, role, details))),
        deleteRole: ({ role }) =>
          SignedIn.use((person) => withCore("delete role")(deleteRole(person, role))),
        scopeMembers: ({ scope }) =>
          SignedIn.use((person) => withCore("members")(scopeMembers(person, scope))),
        grantRole: ({ person: who, role, scope }) =>
          SignedIn.use((person) => withCore("grant role")(grantRoleTo(person, who, role, scope))),
        changeRole: ({ person: who, from, to, scope }) =>
          SignedIn.use((person) =>
            withCore("change role")(changeRoleOf(person, who, from, to, scope)),
          ),
        revokeRole: ({ person: who, role, scope }) =>
          SignedIn.use((person) =>
            withCore("revoke role")(revokeRoleFrom(person, who, role, scope)),
          ),
        setOverride: ({ person: who, permission, scope, allowed }) =>
          SignedIn.use((person) =>
            withCore("set override")(setOverrideFor(person, who, permission, scope, allowed)),
          ),
        removeOverride: ({ person: who, permission, scope }) =>
          SignedIn.use((person) =>
            withCore("remove override")(removeOverrideFor(person, who, permission, scope)),
          ),
        removeAllAccess: ({ person: who }) =>
          SignedIn.use((person) => withCore("remove access")(removeAllAccessOf(person, who))),
        invite: ({ email, role, scope }) =>
          SignedIn.use((person) =>
            withCore("invite")(
              Effect.gen(function* () {
                const studio = yield* StudioAddress;
                return yield* invite(mailerFor(env), person, email, role, scope, studio);
              }),
            ),
          ),
        revokeInvitation: ({ invitation }) =>
          SignedIn.use((person) =>
            withCore("revoke invitation")(revokeInvitation(person, invitation)),
          ),
        acceptInvitation: ({ token }) =>
          SignedIn.use((person) => withCore("accept invitation")(acceptInvitation(person, token))),
        createBrand: ({ name, brandColor }) =>
          SignedIn.use((person) => withCore("create brand")(createBrand(person, name, brandColor))),
        newSiteOptions: () =>
          SignedIn.use((person) =>
            withCore("new site options")(
              Effect.map(brandsForNewSites(person), (brands) => ({
                brands,
                sitesHost: env.SITES_HOST,
              })),
            ),
          ),
        createSite: ({ brand, name, address }) =>
          SignedIn.use((person) =>
            withCore("create site")(
              Effect.gen(function* () {
                const created = yield* createSite(person, brand, name, address);
                const revision = pinnedRevision(yield* latestRevision(brand));
                const doc = yield* siteDoc(env, created.id);
                const studio = yield* StudioAddress;
                const draft = yield* Effect.tryPromise(async (): Promise<DraftSummary> =>
                  doc.start(collaborator(person), name, revision, studio),
                );
                // The host is written last, so sites never finds a site with no release.
                yield* Effect.tryPromise(() =>
                  env.ROUTING.put(routingKeys.host(`${address}.${env.SITES_HOST}`), created.id),
                );
                yield* audit(person, { site: created.id }, { _tag: "SiteCreated", name });
                return { site: { id: created.id, name: created.name }, draft: draft.id };
              }),
            ),
          ),
        home: () =>
          SignedIn.use((person) =>
            withCore("home")(
              Effect.all({ waiting: waitingFor(person), shared: sharedWith(person) }),
            ),
          ),
        people: ({ search }) => withCore("people")(findPeople(search)),
        siteSettings: ({ site }) =>
          SignedIn.use((person) =>
            withCore("site settings")(
              Effect.gen(function* () {
                const found = yield* siteOf(person, site);
                const doc = yield* siteDoc(env, site);
                const view = yield* Effect.tryPromise(async (): Promise<SettingsView> =>
                  doc.settings(),
                );
                return yield* settingsView(found, view);
              }),
            ),
          ),
        saveSiteSettings: ({ site, changes, seen }) =>
          SignedIn.use((person) =>
            withCore("save site settings")(
              Effect.gen(function* () {
                const { found, doc } = yield* permitted(
                  person,
                  site,
                  "site.settings.edit",
                  "change this site's settings",
                );
                const image = changes.sharingImage;
                if (
                  image !== undefined &&
                  image !== null &&
                  !(yield* inSiteLibrary(found, image.id))
                )
                  return yield* new ImageNotFound({});
                const studio = yield* StudioAddress;
                const view = yield* outcome(
                  SettingsChanged,
                  async (): Promise<Outcome<SettingsView>> =>
                    doc.saveSettings(collaborator(person), changes, seen, studio),
                );
                return yield* settingsView({ ...found, name: view.settings.name }, view);
              }),
            ),
          ),
        deleteSite: ({ site }) =>
          SignedIn.use((person) =>
            withCore("delete site")(
              // The site stops serving at once: no host leads to it.
              deleteSite(person, site, (hosts) =>
                Effect.forEach(
                  [
                    ...(hosts.address === null ? [] : [`${hosts.address}.${env.SITES_HOST}`]),
                    ...hosts.domains.map((hostname) => routedHost(hostname, env.SITES_HOST)),
                  ],
                  (host) => Effect.promise(() => env.ROUTING.delete(routingKeys.host(host))),
                  { discard: true },
                ),
              ),
            ),
          ),
        deletedSites: () =>
          SignedIn.use((person) => withCore("deleted sites")(deletedSites(person))),
        restoreSite: ({ site }) =>
          SignedIn.use((person) =>
            withCore("restore site")(
              restoreSite(person, site, (address) =>
                Effect.promise(() =>
                  env.ROUTING.put(routingKeys.host(`${address}.${env.SITES_HOST}`), site),
                ),
              ),
            ),
          ),
        deleteBrand: ({ brand }) =>
          SignedIn.use((person) =>
            withCore("delete brand")(
              deleteBrand(person, brand, (media) =>
                Effect.promise(() => env.CONTENT.delete(objectKeys.media(media))),
              ),
            ),
          ),
        siteDomains: ({ site }) =>
          SignedIn.use((person) =>
            withCore("site domains")(Effect.flatMap(siteOf(person, site), domainsView)),
          ),
        addDomain: ({ site, hostname }) =>
          SignedIn.use((person) =>
            withCore("add domain")(
              Effect.gen(function* () {
                const { found } = yield* permitted(
                  person,
                  site,
                  "site.settings.edit",
                  "change this site's domains",
                );
                yield* addDomain(found.id, hostname, person, env.SITES_HOST);
                return yield* domainsView(found);
              }),
            ),
          ),
        checkDomains: ({ site }) =>
          SignedIn.use((person) =>
            withCore("check domain")(
              Effect.gen(function* () {
                const { found } = yield* permitted(
                  person,
                  site,
                  "site.settings.edit",
                  "change this site's domains",
                );
                yield* checkDomains(found.id, route);
                return yield* domainsView(found);
              }),
            ),
          ),
        removeDomain: ({ site, hostname }) =>
          SignedIn.use((person) =>
            withCore("remove domain")(
              Effect.gen(function* () {
                const { found } = yield* permitted(
                  person,
                  site,
                  "site.settings.edit",
                  "change this site's domains",
                );
                yield* removeDomain(found.id, hostname, person, (removed) =>
                  Effect.promise(() =>
                    env.ROUTING.delete(routingKeys.host(routedHost(removed, env.SITES_HOST))),
                  ),
                );
                return yield* domainsView(found);
              }),
            ),
          ),
        mediaLibrary: ({ site }) =>
          SignedIn.use((person) =>
            withCore("media library")(
              Effect.gen(function* () {
                const found = yield* siteOf(person, site);
                const doc = yield* siteDoc(env, site);
                const inUse = yield* Effect.tryPromise(() => doc.imagesInUse());
                const pages = new Map(inUse.map(({ media, pages }) => [media, pages]));
                const usedOn = (media: MediaId) => pages.get(media) ?? [];
                const brand = yield* describeScope({ kind: "brand", id: found.brand }).pipe(
                  Effect.catchTag("ScopeNotFound", Effect.die),
                );
                const { access } = yield* loadAccess(person.id);
                return {
                  site: { id: found.id, name: found.name },
                  brand: { id: found.brand, name: brand.name },
                  siteImages: yield* libraryImages({ kind: "site", id: found.id }, usedOn),
                  brandImages: yield* libraryImages({ kind: "brand", id: found.brand }, usedOn),
                  can: {
                    editSite: found.permissions.includes("page.edit"),
                    editBrand: authorize(access, "brand.theme.edit", {
                      kind: "brand",
                      id: found.brand,
                    }),
                  },
                };
              }),
            ),
          ),
        saveAltText: ({ site, media, alt }) =>
          SignedIn.use((person) =>
            withCore("save alt text")(
              Effect.gen(function* () {
                const sql = yield* SqlClient.SqlClient;
                const found = yield* siteOf(person, site);
                const library = yield* libraryOf(found, media);
                if (library === null) return yield* new ImageNotFound({});
                const { access } = yield* loadAccess(person.id);
                const allowed =
                  library === "site"
                    ? found.permissions.includes("page.edit")
                    : authorize(access, "brand.theme.edit", { kind: "brand", id: found.brand });
                if (!allowed)
                  return yield* new NotPermitted({ action: "change this image's alt text" });
                yield* sql`update media set alt = ${alt.trim()} where id = ${media}`;
              }),
            ),
          ),
        siteEntries: ({ site }) =>
          SignedIn.use((person) =>
            withCore("site entries")(
              Effect.gen(function* () {
                const { found, doc } = yield* permitted(
                  person,
                  site,
                  "submissions.read",
                  "read this site's form entries",
                );
                const [forms, received] = yield* Effect.all(
                  [
                    Effect.tryPromise(async (): Promise<ReadonlyArray<SiteForm>> => doc.forms()),
                    Effect.tryPromise(() => entriesOf(site).forms()),
                  ],
                  { concurrency: "unbounded" },
                );
                const counted = new Map(received.map((form) => [form.id, form]));
                return {
                  site: { id: found.id, name: found.name },
                  forms: [
                    ...received,
                    ...forms
                      .filter((form) => !counted.has(form.id))
                      .map((form) => ({ id: form.id, name: form.name, entries: 0, latest: null })),
                  ],
                  can: {
                    export: found.permissions.includes("submissions.export"),
                    delete: found.permissions.includes("submissions.delete"),
                  },
                };
              }),
            ),
          ),
        formEntries: ({ site, form, search, before }) =>
          SignedIn.use((person) =>
            withCore("form entries")(
              Effect.gen(function* () {
                yield* permitted(person, site, "submissions.read", "read this site's form entries");
                const entries = yield* Effect.tryPromise(() =>
                  entriesOf(site).entries({ form, search, before, limit: entriesPage + 1 }),
                );
                // Each look at a list is logged once, when it opens, not as it pages.
                if (before === null)
                  yield* audit(
                    person,
                    { site },
                    {
                      _tag: "EntriesViewed",
                      form: entries[0]?.formName ?? form,
                      formId: form,
                      entry: null,
                    },
                  );
                return {
                  entries: entries.slice(0, entriesPage),
                  more: entries.length > entriesPage,
                };
              }),
            ),
          ),
        formEntry: ({ site, entry }) =>
          SignedIn.use((person) =>
            withCore("form entry")(
              Effect.gen(function* () {
                yield* permitted(person, site, "submissions.read", "read this site's form entries");
                const found = yield* Effect.tryPromise(() => entriesOf(site).entry(entry));
                if (found === null) return yield* new EntryNotFound({});
                yield* audit(
                  person,
                  { site },
                  { _tag: "EntriesViewed", form: found.formName, formId: found.form, entry },
                );
                return found;
              }),
            ),
          ),
        exportEntries: ({ site, form }) =>
          SignedIn.use((person) =>
            withCore("export entries")(
              Effect.gen(function* () {
                const { found } = yield* permitted(
                  person,
                  site,
                  "submissions.export",
                  "export this site's form entries",
                );
                const entries = yield* Effect.tryPromise(() => entriesOf(site).everyEntry(form));
                const name = entries.at(-1)?.formName ?? form;
                yield* audit(
                  person,
                  { site },
                  { _tag: "EntriesExported", form: name, formId: form, entries: entries.length },
                );
                return {
                  filename: `${found.name} - ${name}.csv`.replaceAll(/[\\/:*?"<>|]/g, ""),
                  csv: entriesCsv(entries),
                };
              }),
            ),
          ),
        deleteEntry: ({ site, entry }) =>
          SignedIn.use((person) =>
            withCore("delete entry")(
              Effect.gen(function* () {
                yield* permitted(person, site, "submissions.delete", "delete form entries");
                const removed = yield* Effect.tryPromise(() => entriesOf(site).remove(entry));
                if (!removed) return yield* new EntryNotFound({});
                yield* audit(
                  person,
                  { site },
                  { _tag: "EntriesDeleted", entries: 1, onePerson: false },
                );
              }),
            ),
          ),
        entriesFrom: ({ site, email }) =>
          SignedIn.use((person) =>
            withCore("entries from")(
              Effect.gen(function* () {
                yield* permitted(person, site, "submissions.delete", "delete form entries");
                return yield* Effect.tryPromise(() => entriesOf(site).countFor(email));
              }),
            ),
          ),
        deleteEntriesFor: ({ site, email }) =>
          SignedIn.use((person) =>
            withCore("delete entries")(
              Effect.gen(function* () {
                yield* permitted(person, site, "submissions.delete", "delete form entries");
                const deleted = yield* Effect.tryPromise(() => entriesOf(site).removeFor(email));
                yield* audit(
                  person,
                  { site },
                  { _tag: "EntriesDeleted", entries: deleted, onePerson: true },
                );
                return { deleted };
              }),
            ),
          ),
        siteDrafts: ({ site }) =>
          SignedIn.use((person) =>
            withCore("site drafts")(
              Effect.gen(function* () {
                const { found, doc } = yield* editable(person, site);
                const [live, drafts] = yield* Effect.all(
                  [
                    liveOf(doc),
                    Effect.tryPromise(async (): Promise<ReadonlyArray<DraftSummary>> =>
                      doc.drafts(),
                    ),
                  ],
                  { concurrency: "unbounded" },
                );
                return {
                  site: { id: found.id, name: found.name },
                  live,
                  drafts,
                  can: abilities(found.permissions),
                };
              }),
            ),
          ),
        createDraft: ({ site, name }) =>
          SignedIn.use((person) =>
            withCore("create draft")(
              Effect.gen(function* () {
                const { doc } = yield* editable(person, site);
                return yield* Effect.tryPromise(async (): Promise<DraftSummary> =>
                  doc.createDraft(collaborator(person), name),
                );
              }),
            ),
          ),
        renameDraft: ({ site, draft, name }) =>
          SignedIn.use((person) =>
            withCore("rename draft")(
              Effect.gen(function* () {
                const { doc } = yield* editable(person, site);
                yield* outcome(DraftNotFound, async (): Promise<Outcome<void>> =>
                  doc.renameDraft(draft, name),
                );
              }),
            ),
          ),
        closeDraft: ({ site, draft }) =>
          SignedIn.use((person) =>
            withCore("close draft")(
              Effect.gen(function* () {
                const { doc } = yield* editable(person, site);
                yield* outcome(DraftNotFound, async (): Promise<Outcome<void>> =>
                  doc.closeDraft(collaborator(person), draft),
                );
              }),
            ),
          ),
        draftPages: ({ site, draft }) =>
          SignedIn.use((person) =>
            withCore("draft pages")(
              Effect.gen(function* () {
                const { found, doc } = yield* editableDraft(person, site, draft);
                const [view, live] = yield* Effect.all(
                  [
                    outcome(DraftNotFound, async (): Promise<Outcome<DraftView>> =>
                      doc.viewDraft(draft),
                    ),
                    liveOf(doc),
                  ],
                  { concurrency: "unbounded" },
                );
                return {
                  site: { id: found.id, name: found.name },
                  live: liveReleaseOf(live),
                  draft: view.summary,
                  pages: pageSummaries(view.draft).map((page) => ({
                    ...page,
                    standing: view.standings[page.id] ?? "new",
                  })),
                  menus: view.draft.parts.menus,
                  redirects: view.draft.redirects,
                  can: abilities(found.permissions),
                };
              }),
            ),
          ),
        openDraft: ({ site, draft }) =>
          SignedIn.use((person) =>
            withCore("open draft")(
              Effect.gen(function* () {
                const { found, doc } = yield* editableDraft(person, site, draft);
                const opened = yield* outcome(DraftNotFound, async (): Promise<Outcome<Opened>> =>
                  doc.openDraft(collaborator(person), draft),
                );
                if (opened._tag === "NeedsUpdate") return OpenedDraft.cases.NeedsUpdate.make({});
                const [media, live, settings] = yield* Effect.all(
                  [
                    siteMedia(found),
                    liveOf(doc),
                    Effect.tryPromise(async (): Promise<SettingsView> => doc.settings()),
                  ],
                  { concurrency: "unbounded" },
                );
                return OpenedDraft.cases.Ready.make({
                  draft: opened.draft,
                  summary: opened.summary,
                  settings: publishedOf(settings.settings),
                  live: liveReleaseOf(live),
                  media,
                  can: abilities(found.permissions),
                });
              }),
            ),
          ),
        applyBatch: ({ site, draft, batch }) =>
          SignedIn.use((person) =>
            withCore("apply batch")(
              Effect.gen(function* () {
                const { doc } = yield* editableDraft(person, site, draft);
                const result = yield* outcome(
                  DraftNotFound,
                  async (): Promise<Outcome<BatchResult>> =>
                    doc.applyBatch(collaborator(person), draft, batch),
                );
                switch (result.status) {
                  case "committed":
                    return { status: "committed", revision: result.commit.batch.revision } as const;
                  case "duplicate":
                    return { status: "committed", revision: result.revision } as const;
                  case "rejected":
                    return { status: "rejected", errors: result.errors } as const;
                }
              }),
            ),
          ),
        draftUpdate: ({ site, draft, resolutions }) =>
          SignedIn.use((person) =>
            withCore("draft update")(
              Effect.gen(function* () {
                const { found, doc } = yield* editableDraft(person, site, draft);
                const [preview, view] = yield* Effect.all(
                  [
                    outcome(DraftNotFound, async (): Promise<Outcome<UpdatePreview>> =>
                      doc.previewUpdate(draft, resolutions),
                    ),
                    outcome(DraftNotFound, async (): Promise<Outcome<DraftView>> =>
                      doc.viewDraft(draft),
                    ),
                  ],
                  { concurrency: "unbounded" },
                );
                return {
                  site: { id: found.id, name: found.name },
                  draft: view.summary,
                  ...preview,
                };
              }),
            ),
          ),
        updateDraft: ({ site, draft, resolutions, seen }) =>
          SignedIn.use((person) =>
            withCore("update draft")(
              Effect.gen(function* () {
                const { doc } = yield* editableDraft(person, site, draft);
                return yield* outcome(DraftNotFound, async (): Promise<Outcome<UpdateOutcome>> =>
                  doc.updateDraft(collaborator(person), draft, resolutions, seen),
                );
              }),
            ),
          ),
        suggestMerge: ({ site, draft, conflict }) =>
          SignedIn.use((person) =>
            withCore("suggest a merge")(
              Effect.gen(function* () {
                const { found, doc } = yield* editableDraft(person, site, draft);
                const [preview, view] = yield* Effect.all(
                  [
                    outcome(DraftNotFound, async (): Promise<Outcome<UpdatePreview>> =>
                      doc.previewUpdate(draft, {}),
                    ),
                    outcome(DraftNotFound, async (): Promise<Outcome<DraftView>> =>
                      doc.viewDraft(draft),
                    ),
                  ],
                  { concurrency: "unbounded" },
                );
                const conflicting = preview.conflicts.find(
                  (candidate) => candidate.key === conflict,
                );
                if (conflicting === undefined) return null;
                return yield* mergeSuggestion(
                  env,
                  { site: found, person: person.id },
                  view.draft,
                  conflicting,
                );
              }),
            ),
          ),
        suggestAltText: ({ site, draft, media, block }) =>
          SignedIn.use((person) =>
            withCore("suggest alt text")(
              Effect.gen(function* () {
                const { found, doc } = yield* editableDraft(person, site, draft);
                if (!(yield* inSiteLibrary(found, media))) return null;
                const view = yield* outcome(DraftNotFound, async (): Promise<Outcome<DraftView>> =>
                  doc.viewDraft(draft),
                );
                return yield* altTextSuggestion(
                  env,
                  { site: found, person: person.id },
                  view.draft,
                  media,
                  block,
                );
              }),
            ),
          ),
        draftSharing: ({ site, draft }) =>
          SignedIn.use((person) =>
            withCore("draft sharing")(
              Effect.gen(function* () {
                const { found, doc } = yield* editableDraft(person, site, draft);
                const view = yield* outcome(DraftNotFound, async (): Promise<Outcome<DraftView>> =>
                  doc.viewDraft(draft),
                );
                return {
                  draft: { id: draft, name: view.summary.name },
                  owner: view.summary.createdBy,
                  sharing: view.summary.sharing,
                  can: { share: found.permissions.includes("draft.share") },
                };
              }),
            ),
          ),
        shareDraft: ({ site, draft, sharing }) =>
          SignedIn.use((person) =>
            withCore("share draft")(
              Effect.gen(function* () {
                const { doc } = yield* permitted(
                  person,
                  site,
                  "draft.share",
                  "share drafts on this site",
                );
                const summary = yield* outcome(
                  DraftNotFound,
                  async (): Promise<Outcome<DraftSummary>> =>
                    doc.shareDraft(collaborator(person), draft, sharing),
                );
                return {
                  draft: { id: draft, name: summary.name },
                  owner: summary.createdBy,
                  sharing: summary.sharing,
                  can: { share: true },
                };
              }),
            ),
          ),
        submissionCheck: ({ site, draft }) =>
          SignedIn.use((person) =>
            withCore("submission check")(
              Effect.gen(function* () {
                const { found, doc } = yield* permitted(
                  person,
                  site,
                  "site.publish",
                  "submit drafts on this site",
                );
                const [check, workflow] = yield* Effect.all(
                  [outcome(DraftNotFound, () => doc.checkDraft(draft)), siteWorkflow(found)],
                  { concurrency: "unbounded" },
                );
                return { ...check, workflow };
              }),
            ),
          ),
        submitDraft: ({ site, draft, note }) =>
          SignedIn.use((person) =>
            withCore("submit draft")(
              Effect.gen(function* () {
                const { found, doc } = yield* permitted(
                  person,
                  site,
                  "site.publish",
                  "submit drafts on this site",
                );
                const workflow = yield* siteWorkflow(found);
                const studio = yield* StudioAddress;
                return yield* outcome(DraftNotFound, async (): Promise<Outcome<SubmitOutcome>> =>
                  doc.submit(collaborator(person), draft, note, workflow.steps, studio),
                );
              }),
            ),
          ),
        siteOverview: ({ site }) =>
          SignedIn.use((person) =>
            withCore("site overview")(
              Effect.gen(function* () {
                const found = yield* siteOf(person, site);
                const doc = yield* siteDoc(env, site);
                const since = Timestamp.make(
                  new Date(Date.now() - newEntriesDays * 24 * 60 * 60 * 1000).toISOString(),
                );
                const [live, domains, editing, newEntries] = yield* Effect.all(
                  [
                    Effect.tryPromise(
                      async (): Promise<{ readonly release: Release; readonly view: SiteView }> =>
                        doc.liveHome(),
                    ),
                    siteDomains(site, env.SITES_HOST),
                    found.permissions.includes("page.edit") ? editingOf(doc) : Effect.succeed(null),
                    found.permissions.includes("submissions.read")
                      ? Effect.tryPromise(() => entriesOf(site).receivedSince(since))
                      : Effect.succeed(null),
                  ],
                  { concurrency: "unbounded" },
                );
                const own = domains.find((domain) => domain.status === "active");
                return {
                  site: { id: found.id, name: found.name },
                  addresses: {
                    own:
                      own === undefined
                        ? null
                        : siteAddress(routedHost(own.hostname, env.SITES_HOST), env.ENVIRONMENT),
                    pakshi:
                      found.address === null
                        ? null
                        : siteAddress(`${found.address}.${env.SITES_HOST}`, env.ENVIRONMENT),
                  },
                  live: live.release,
                  home: live.view.page === null ? null : { ...live.view, page: live.view.page },
                  editing,
                  newEntries,
                };
              }),
            ),
          ),
        siteReleases: ({ site }) =>
          SignedIn.use((person) =>
            withCore("site releases")(
              Effect.gen(function* () {
                const { found, doc } = yield* editable(person, site);
                return {
                  site: { id: found.id, name: found.name },
                  releases: yield* Effect.tryPromise(async (): Promise<ReadonlyArray<Release>> =>
                    doc.releases(),
                  ),
                  can: abilities(found.permissions),
                };
              }),
            ),
          ),
        rollBack: ({ site }) =>
          SignedIn.use((person) =>
            withCore("roll back")(
              Effect.gen(function* () {
                const { doc } = yield* permitted(
                  person,
                  site,
                  "site.rollback",
                  "roll back this site",
                );
                const studio = yield* StudioAddress;
                return yield* outcome(
                  Schema.Union([NothingToRollBack, BlocksRemoved]),
                  async (): Promise<Outcome<Release>> => doc.rollBack(collaborator(person), studio),
                );
              }),
            ),
          ),
        restoreRelease: ({ site, release, name }) =>
          SignedIn.use((person) =>
            withCore("restore release")(
              Effect.gen(function* () {
                const { doc } = yield* editable(person, site);
                const draft = yield* outcome(
                  BlocksRemoved,
                  async (): Promise<Outcome<DraftSummary | null>> =>
                    doc.restore(collaborator(person), release, name),
                );
                return draft ?? (yield* new ReleaseNotFound({ release }));
              }),
            ),
          ),
        brands: () => SignedIn.use((person) => withCore("brands")(brandsFor(person))),
        brand: ({ brand }) => SignedIn.use((person) => withCore("brand")(brandView(person, brand))),
        saveBrandLook: ({ brand, look, seen }) =>
          SignedIn.use((person) =>
            withCore("save brand look")(
              Effect.gen(function* () {
                const revision = yield* saveLook(person, brand, look, seen);
                const { sites } = yield* brandView(person, brand);
                // A site that can't be reached now gets the revision from the scheduled job.
                const updates = yield* Effect.forEach(
                  sites,
                  (site) =>
                    offerRevision(env, site.id, revision).pipe(
                      Effect.map((update) => ({
                        site,
                        draft:
                          update._tag === "Draft"
                            ? { id: update.draft.id, name: update.draft.name }
                            : null,
                        pending: false,
                      })),
                      Effect.catch((cause) =>
                        Effect.as(Effect.logError(`Offering ${site.id} a revision failed`, cause), {
                          site,
                          draft: null,
                          pending: true,
                        }),
                      ),
                    ),
                  { concurrency: 10 },
                );
                yield* audit(
                  person,
                  { brand },
                  {
                    _tag: "BrandLookSaved",
                    revision: revision.number,
                    sites: updates.filter((update) => update.draft !== null).length,
                  },
                );
                return {
                  revision: {
                    number: revision.number,
                    by: revision.created_by,
                    at: revision.created_at,
                  },
                  sites: updates,
                };
              }),
            ),
          ),
        blockRequests: () =>
          SignedIn.use((person) => withCore("block requests")(blockRequests(person))),
        requestBlock: ({ site, need, example }) =>
          SignedIn.use((person) =>
            withCore("request block")(requestBlock(person, { site, need, example, nearest: null })),
          ),
        closeBlockRequest: ({ request }) =>
          SignedIn.use((person) =>
            withCore("close block request")(closeBlockRequest(person, request)),
          ),
        saveVoiceGuide: ({ brand, voice }) =>
          SignedIn.use((person) => withCore("save voice guide")(saveVoice(person, brand, voice))),
        blockUpdates: () =>
          SignedIn.use((person) =>
            withCore("block updates")(
              Effect.gen(function* () {
                const { access } = yield* loadAccess(person.id);
                if (!authorize(access, "blocks.upgrade", { kind: "organization" }))
                  return yield* new NotPermitted({ action: "see which blocks sites can update" });
                const [shown, removable] = yield* Effect.all(
                  [
                    Effect.flatMap(sitesOf(person), (sites) => shownBlocks(env, sites)),
                    removableVersions(),
                  ],
                  { concurrency: "unbounded" },
                );
                const behind = new Map<BlockType, number>();
                for (const { blocks } of shown)
                  for (const block of blocks.filter(isBehind))
                    behind.set(block.type, (behind.get(block.type) ?? 0) + 1);
                return {
                  behind: Array.from(behind, ([type, sites]) => ({ type, sites })),
                  removable,
                };
              }),
            ),
          ),
        blockUsage: ({ type }) =>
          SignedIn.use((person) =>
            withCore("block usage")(
              Effect.map(
                Effect.flatMap(sitesOf(person), (sites) => shownBlocks(env, sites)),
                (shown) =>
                  shown.flatMap(({ site, blocks }) =>
                    blocks
                      .filter((block) => block.type === type)
                      .map((block) => ({
                        site,
                        version: block.version,
                        pages: block.pages,
                        sitewide: block.sitewide,
                      })),
                  ),
              ),
            ),
          ),
        siteBlocks: ({ site }) =>
          SignedIn.use((person) =>
            withCore("site blocks")(
              Effect.gen(function* () {
                const { found, doc } = yield* editable(person, site);
                const [inUse, drafts] = yield* Effect.all(
                  [
                    Effect.tryPromise(async (): Promise<ReadonlyArray<BlockInUse>> =>
                      doc.blocksInUse(),
                    ),
                    Effect.tryPromise(async (): Promise<ReadonlyArray<DraftSummary>> =>
                      doc.drafts(),
                    ),
                  ],
                  { concurrency: "unbounded" },
                );
                const blocks = yield* Effect.forEach(inUse, (block) =>
                  Effect.gen(function* () {
                    const latest = latestLockfile[block.type] ?? block.version;
                    const upgrade = drafts.find(
                      (draft) =>
                        draft.status === "open" &&
                        draft.kind._tag === "BlockUpgrade" &&
                        draft.kind.type === block.type &&
                        draft.kind.version === latest,
                    );
                    return {
                      ...block,
                      title: yield* blockTitle(block.type),
                      latest,
                      newer: yield* newerVersions(block.type, block.version),
                      upgradeDraft:
                        upgrade === undefined ? null : { id: upgrade.id, name: upgrade.name },
                      renderingChanges: renderingChanges
                        .filter((entry) =>
                          entry.versions.includes(blockKey(block.type, block.version)),
                        )
                        .map(({ date, change }) => ({ date, change })),
                    };
                  }),
                );
                return {
                  site: { id: found.id, name: found.name },
                  blocks: blocks.toSorted((a, b) => a.title.localeCompare(b.title)),
                  can: { upgrade: found.permissions.includes("blocks.upgrade") },
                };
              }),
            ),
          ),
        adoptUpgrade: ({ site, type }) =>
          SignedIn.use((person) =>
            withCore("adopt upgrade")(
              Effect.gen(function* () {
                const { doc } = yield* permitted(
                  person,
                  site,
                  "blocks.upgrade",
                  "adopt block upgrades on this site",
                );
                const latest = latestLockfile[type];
                const draft =
                  latest === undefined
                    ? null
                    : yield* Effect.tryPromise(async (): Promise<DraftSummary | null> =>
                        doc.adoptUpgrade(collaborator(person), type, latest),
                      );
                return draft ?? (yield* new UpToDate({ type }));
              }),
            ),
          ),
        upgradeEverywhere: ({ type }) =>
          SignedIn.use((person) =>
            withCore("upgrade everywhere")(
              Effect.gen(function* () {
                const { access } = yield* loadAccess(person.id);
                if (!authorize(access, "blocks.upgrade", { kind: "organization" }))
                  return yield* new NotPermitted({ action: "upgrade a block on every site" });
                const latest = latestLockfile[type];
                if (latest === undefined) return [];
                const shown = yield* Effect.flatMap(sitesOf(person), (sites) =>
                  shownBlocks(env, sites),
                );
                const sites = shown.flatMap(({ site, blocks }) =>
                  blocks.some((block) => block.type === type && isBehind(block)) ? [site] : [],
                );
                const upgrades = yield* Effect.forEach(
                  sites,
                  (site) =>
                    Effect.gen(function* () {
                      const draft = yield* siteDoc(env, site.id).pipe(
                        Effect.flatMap((doc) =>
                          Effect.tryPromise(async (): Promise<DraftSummary | null> =>
                            doc.adoptUpgrade(collaborator(person), type, latest),
                          ),
                        ),
                        Effect.map((found) =>
                          found === null ? null : { id: found.id, name: found.name },
                        ),
                        Effect.option,
                      );
                      return {
                        site: { id: site.id, name: site.name },
                        draft: Option.getOrNull(draft),
                        failed: Option.isNone(draft),
                      };
                    }),
                  { concurrency: 10 },
                );
                yield* audit(
                  person,
                  {},
                  {
                    _tag: "BlockUpgradeEverywhere",
                    block: type,
                    version: latest,
                    sites: upgrades.filter((upgrade) => upgrade.draft !== null).length,
                  },
                );
                return upgrades;
              }),
            ),
          ),
        workflow: ({ scope }) =>
          SignedIn.use((person) => withCore("workflow")(workflowView(person, scope))),
        saveWorkflow: ({ scope, steps }) =>
          SignedIn.use((person) => withCore("save workflow")(saveWorkflow(person, scope, steps))),
        approvals: () =>
          SignedIn.use((person) =>
            withCore("approvals")(
              Effect.all({
                waiting: waitingFor(person),
                sent: sentBy(person),
                finished: finishedFor(person),
              }),
            ),
          ),
        review: ({ site, submission }) =>
          SignedIn.use((person) =>
            withCore("review")(
              Effect.gen(function* () {
                const found = yield* siteOf(person, site);
                const doc = yield* siteDoc(env, site);
                const review = yield* outcome(
                  SubmissionNotFound,
                  async (): Promise<Outcome<SubmissionReview>> => doc.review(submission),
                );
                return {
                  site: { id: found.id, name: found.name },
                  ...review,
                  decidable: eligibility(review.submission, approverOn(person, found)),
                };
              }),
            ),
          ),
        reviewPage: ({ site, submission, snapshot, version, path }) =>
          SignedIn.use((person) =>
            withCore("review page")(
              Effect.gen(function* () {
                yield* siteOf(person, site);
                const doc = yield* siteDoc(env, site);
                return yield* outcome(SubmissionNotFound, async (): Promise<Outcome<ReviewPage>> =>
                  doc.submissionView(submission, snapshot, version, path),
                );
              }),
            ),
          ),
        decide: ({ site, submission, snapshot, decision, note }) =>
          SignedIn.use((person) =>
            withCore("decide")(
              Effect.gen(function* () {
                const found = yield* siteOf(person, site);
                const doc = yield* siteDoc(env, site);
                const studio = yield* StudioAddress;
                return yield* outcome(
                  Schema.Union([SubmissionNotFound, CannotDecide]),
                  async (): Promise<Outcome<DecisionOutcome>> =>
                    doc.decide(
                      approverOn(person, found),
                      submission,
                      snapshot,
                      decision,
                      note,
                      studio,
                    ),
                );
              }),
            ),
          ),
        previewPage: ({ site, draft, path }) =>
          Visitor.use((person) =>
            withCore("preview page")(
              Effect.gen(function* () {
                const found = yield* Effect.option(findSite(site));
                if (Option.isNone(found)) return PreviewPage.cases.NotFound.make({});
                const doc = yield* siteDoc(env, site);
                const editsSite =
                  person !== null &&
                  (yield* standingOn(person, found.value)).permissions.includes("page.edit");
                const access = yield* Effect.tryPromise(() =>
                  doc.access(draft, person === null ? { id: null } : { id: person.id, editsSite }),
                );
                if (access === null)
                  return person === null
                    ? PreviewPage.cases.SignIn.make({})
                    : PreviewPage.cases.NotFound.make({});
                const shown = yield* outcome(
                  DraftNotFound,
                  async (): Promise<
                    Outcome<{ readonly name: Submission["draft"]["name"]; readonly view: SiteView }>
                  > => doc.draftView(draft, path),
                ).pipe(Effect.option);
                if (Option.isNone(shown)) return PreviewPage.cases.NotFound.make({});
                return PreviewPage.cases.Page.make({
                  site: { id: found.value.id, name: found.value.name },
                  draft: { id: draft, name: shown.value.name },
                  access,
                  view: shown.value.view,
                });
              }),
            ),
          ),
      });
    }),
  ).pipe(
    Layer.provide(Layer.merge(D1Client.layer({ db: env.CORE }), liveAccessOf(env))),
    Layer.orDie,
  );

const makeHandler = (env: StudioApiEnv) =>
  rpcWebHandler(StudioRpcs, Layer.mergeAll(handlers(env), sessions(env)));

// A Worker's env is the same object for every request an isolate serves, so
// this builds the handler once per isolate.
const handlerByEnv = new WeakMap<StudioApiEnv, ReturnType<typeof makeHandler>>();

/** Serves StudioRpcs for Studio. */
export const serveStudioRpc = (request: Request, env: StudioApiEnv) => {
  const existing = handlerByEnv.get(env);
  const handler = existing ?? makeHandler(env);
  if (existing === undefined) handlerByEnv.set(env, handler);
  return handler.handler(request);
};
