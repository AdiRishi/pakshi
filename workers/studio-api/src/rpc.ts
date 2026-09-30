import { D1Client } from "@effect/sql-d1";
import type { Draft } from "@repo/contracts/draft";
import type { SiteId } from "@repo/contracts/ids";
import type { Collaborator } from "@repo/contracts/live";
import { liveReleaseOf, type Release } from "@repo/contracts/release";
import { rpcWebHandler } from "@repo/contracts/rpc/server";
import {
  DraftNotFound,
  type DraftSummary,
  NothingToRollBack,
  NotPermitted,
  OpenedDraft,
  type Person,
  type PublishOutcome,
  ReleaseNotFound,
  SignedIn,
  type SiteAbilities,
  StudioRpcs,
  StudioSession,
  studioSessionHeaders,
  StudioUnavailable,
  Unauthenticated,
  type UpdateOutcome,
} from "@repo/contracts/studio";
import type { Permission } from "@repo/contracts/access";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Cause, Effect, Layer, Schema } from "effect";
import { type SqlError, SqlClient } from "effect/unstable/sql";
import { getServerByName } from "partyserver";

import { authFor } from "./auth.ts";
import type { Outcome, SiteDocError } from "./site-doc.ts";
import type { BatchResult } from "./site/drafts.ts";
import type { DraftView, Opened, UpdatePreview } from "./site/site.ts";
import { siteFor, siteMedia, siteOf } from "./sites.ts";
import { describeViewer } from "./viewer.ts";

const unavailable = (operation: string) => (cause: Cause.YieldableError) =>
  Effect.logError(`studio-api ${operation} failed`, cause).pipe(
    Effect.andThen(Effect.fail(new StudioUnavailable({ operation }))),
  );

const session = (env: StudioApiEnv) =>
  Layer.succeed(StudioSession)(
    StudioSession.of((effect, { headers }) =>
      Effect.gen(function* () {
        const origin = headers[studioSessionHeaders.origin];
        const cookie = headers[studioSessionHeaders.cookie];
        if (origin === undefined || cookie === undefined) return yield* new Unauthenticated({});
        const found = yield* Effect.tryPromise(() =>
          authFor(env, origin).api.getSession({ headers: new Headers({ cookie }) }),
        ).pipe(Effect.catch(unavailable("session check")));
        if (found === null) return yield* new Unauthenticated({});
        const { id, name, email } = found.user;
        return yield* Effect.provideService(effect, SignedIn, { id, name, email });
      }),
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
      /** Runs a site's handler against core, turning storage failures into a retryable error. */
      const withCore =
        (operation: string) =>
        <A, E extends { readonly _tag: string }>(
          effect: Effect.Effect<
            A,
            E | SqlError.SqlError | Schema.SchemaError | Cause.UnknownError,
            SqlClient.SqlClient
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

      return StudioRpcs.of({
        viewer: () =>
          SignedIn.use((person) =>
            describeViewer(person).pipe(
              Effect.provideService(SqlClient.SqlClient, sql),
              Effect.catchTags({ SqlError: unavailable("viewer"), SchemaError: Effect.die }),
            ),
          ),
        siteDrafts: ({ site }) =>
          SignedIn.use((person) =>
            withCore("site drafts")(
              Effect.gen(function* () {
                const { found, doc } = yield* editable(person, site);
                const [live, drafts] = yield* Effect.all(
                  [
                    Effect.tryPromise(async (): Promise<Release> => doc.live()),
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
                const { found, doc } = yield* editable(person, site);
                const [view, live] = yield* Effect.all(
                  [
                    outcome(DraftNotFound, async (): Promise<Outcome<DraftView>> =>
                      doc.viewDraft(draft),
                    ),
                    Effect.tryPromise(async (): Promise<Release> => doc.live()),
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
                const { found, doc } = yield* editable(person, site);
                const opened = yield* outcome(DraftNotFound, async (): Promise<Outcome<Opened>> =>
                  doc.openDraft(collaborator(person), draft),
                );
                if (opened._tag === "NeedsUpdate") return OpenedDraft.cases.NeedsUpdate.make({});
                const [media, live] = yield* Effect.all(
                  [siteMedia(found), Effect.tryPromise(async (): Promise<Release> => doc.live())],
                  { concurrency: "unbounded" },
                );
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
                const { doc } = yield* editable(person, site);
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
                const { found, doc } = yield* editable(person, site);
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
                const { doc } = yield* editable(person, site);
                return yield* outcome(DraftNotFound, async (): Promise<Outcome<UpdateOutcome>> =>
                  doc.updateDraft(collaborator(person), draft, resolutions, seen),
                );
              }),
            ),
          ),
        publishDraft: ({ site, draft }) =>
          SignedIn.use((person) =>
            withCore("publish draft")(
              Effect.gen(function* () {
                const { doc } = yield* permitted(person, site, "site.publish", "publish");
                return yield* outcome(DraftNotFound, async (): Promise<Outcome<PublishOutcome>> =>
                  doc.publish(collaborator(person), draft),
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
                const { doc } = yield* permitted(person, site, "site.rollback", "roll back");
                return yield* outcome(NothingToRollBack, async (): Promise<Outcome<Release>> =>
                  doc.rollBack(collaborator(person)),
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
      });
    }),
  ).pipe(Layer.provide(D1Client.layer({ db: env.CORE })), Layer.orDie);

const makeHandler = (env: StudioApiEnv) =>
  rpcWebHandler(StudioRpcs, Layer.mergeAll(handlers(env), session(env)));

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
