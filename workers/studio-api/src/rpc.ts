import { D1Client } from "@effect/sql-d1";
import type { Permission } from "@repo/contracts/access";
import type { Draft } from "@repo/contracts/draft";
import type { DraftId, SiteId } from "@repo/contracts/ids";
import type { Collaborator } from "@repo/contracts/live";
import { liveReleaseOf, type Release } from "@repo/contracts/release";
import { rpcWebHandler } from "@repo/contracts/rpc/server";
import {
  CannotDecide,
  type DecisionOutcome,
  DraftNotFound,
  type DraftSummary,
  NothingToRollBack,
  NotPermitted,
  OpenedDraft,
  type Person,
  PreviewPage,
  ReleaseNotFound,
  type ReviewPage,
  SignedIn,
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
  Visitor,
  VisitorSession,
} from "@repo/contracts/studio";
import type { Submission } from "@repo/contracts/submission";
import { eligibility } from "@repo/domain/approvals";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Cause, Effect, Layer, Option, Schema } from "effect";
import { type SqlError, SqlClient } from "effect/unstable/sql";
import { getServerByName } from "partyserver";

import { authFor } from "./auth.ts";
import { findPeople, finishedFor, sentBy, sharedWith, waitingFor } from "./lists.ts";
import type { Outcome, SiteDocError } from "./site-doc.ts";
import type { BatchResult } from "./site/drafts.ts";
import type { DraftView, Opened, SubmissionReview, UpdatePreview } from "./site/site.ts";
import { approverOn, findSite, siteFor, siteMedia, siteOf, standingOn } from "./sites.ts";
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
});

const collaborator = (person: Person): Collaborator => ({ id: person.id, name: person.name });

const pageSummaries = (draft: Draft) =>
  Object.values(draft.pages)
    .map((page) => ({ id: page.id, type: page.type, path: page.path, title: page.meta.title }))
    .toSorted((a, b) => (a.path < b.path ? -1 : 1));

const handlers = (env: StudioApiEnv) =>
  StudioRpcs.toLayer(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      /** Runs a handler against core, turning storage failures into a retryable error. */
      const withCore =
        (operation: string) =>
        <A, E extends { readonly _tag: string }, R>(
          effect: Effect.Effect<
            A,
            E | SqlError.SqlError | Schema.SchemaError | Cause.UnknownError,
            R | SqlClient.SqlClient
          >,
        ) =>
          effect.pipe(
            Effect.provideService(SqlClient.SqlClient, sql),
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
      const liveOf = (doc: Effect.Success<ReturnType<typeof siteDoc>>) =>
        Effect.tryPromise(async (): Promise<Release> => doc.live());

      return StudioRpcs.of({
        viewer: () => SignedIn.use((person) => withCore("viewer")(describeViewer(person))),
        home: () =>
          SignedIn.use((person) =>
            withCore("home")(
              Effect.all({ waiting: waitingFor(person), shared: sharedWith(person) }),
            ),
          ),
        people: ({ search }) => withCore("people")(findPeople(search)),
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
                  pages: pageSummaries(view.draft),
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
                const [media, live] = yield* Effect.all([siteMedia(found), liveOf(doc)], {
                  concurrency: "unbounded",
                });
                return OpenedDraft.cases.Ready.make({
                  draft: opened.draft,
                  summary: opened.summary,
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
                  async (): Promise<Outcome<DraftSummary>> => doc.shareDraft(draft, sharing),
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
                return yield* outcome(NothingToRollBack, async (): Promise<Outcome<Release>> =>
                  doc.rollBack(collaborator(person), studio),
                );
              }),
            ),
          ),
        restoreRelease: ({ site, release, name }) =>
          SignedIn.use((person) =>
            withCore("restore release")(
              Effect.gen(function* () {
                const { doc } = yield* editable(person, site);
                const draft = yield* Effect.tryPromise(async (): Promise<DraftSummary | null> =>
                  doc.restore(collaborator(person), release, name),
                );
                return draft ?? (yield* new ReleaseNotFound({ release }));
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
        reviewPage: ({ site, submission, version, path }) =>
          SignedIn.use((person) =>
            withCore("review page")(
              Effect.gen(function* () {
                yield* siteOf(person, site);
                const doc = yield* siteDoc(env, site);
                return yield* outcome(SubmissionNotFound, async (): Promise<Outcome<ReviewPage>> =>
                  doc.submissionView(submission, version, path),
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
  ).pipe(Layer.provide(D1Client.layer({ db: env.CORE })), Layer.orDie);

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
