import { D1Client } from "@effect/sql-d1";
import type { Draft } from "@repo/contracts/draft";
import type { SiteId } from "@repo/contracts/ids";
import { rpcWebHandler } from "@repo/contracts/rpc/server";
import {
  type BatchOutcome,
  SignedIn,
  type SiteNotFound,
  StudioRpcs,
  StudioSession,
  studioSessionHeaders,
  StudioUnavailable,
  Unauthenticated,
} from "@repo/contracts/studio";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Cause, Effect, Layer, type Schema } from "effect";
import { type SqlError, SqlClient } from "effect/unstable/sql";
import { getServerByName } from "partyserver";

import { authFor } from "./auth.ts";
import { siteFor, siteMedia } from "./sites.ts";
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

const openDraft = (env: StudioApiEnv, site: SiteId) =>
  Effect.flatMap(siteDoc(env, site), (doc) =>
    Effect.tryPromise(async (): Promise<Draft> => doc.draft()),
  );

const handlers = (env: StudioApiEnv) =>
  StudioRpcs.toLayer(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      /** Runs a site's handler against core, turning storage failures into a retryable error. */
      const withCore =
        (operation: string) =>
        <A>(
          effect: Effect.Effect<
            A,
            SiteNotFound | SqlError.SqlError | Schema.SchemaError | Cause.UnknownError,
            SqlClient.SqlClient
          >,
        ) =>
          effect.pipe(
            Effect.provideService(SqlClient.SqlClient, sql),
            Effect.catchTags({
              SqlError: unavailable(operation),
              UnknownError: unavailable(operation),
              // A row that doesn't match its schema is a bug, not an outage.
              SchemaError: Effect.die,
            }),
          );
      return StudioRpcs.of({
        viewer: () =>
          SignedIn.use((person) =>
            describeViewer(person).pipe(
              Effect.provideService(SqlClient.SqlClient, sql),
              Effect.catchTags({ SqlError: unavailable("viewer"), SchemaError: Effect.die }),
            ),
          ),
        sitePages: ({ site }) =>
          SignedIn.use((person) =>
            withCore("site pages")(
              Effect.gen(function* () {
                const found = yield* siteFor(person, site, "page.edit");
                const draft = yield* openDraft(env, site);
                return {
                  site: { id: found.id, name: found.name },
                  draft: draft.id,
                  pages: Object.values(draft.pages)
                    .map((page) => ({
                      id: page.id,
                      type: page.type,
                      path: page.path,
                      title: page.meta.title,
                    }))
                    .toSorted((a, b) => (a.path < b.path ? -1 : 1)),
                };
              }),
            ),
          ),
        editorDraft: ({ site }) =>
          SignedIn.use((person) =>
            withCore("editor draft")(
              Effect.gen(function* () {
                const found = yield* siteFor(person, site, "page.edit");
                const [draft, media] = yield* Effect.all([openDraft(env, site), siteMedia(found)], {
                  concurrency: "unbounded",
                });
                return { draft, media };
              }),
            ),
          ),
        applyBatch: ({ site, batch }) =>
          SignedIn.use((person) =>
            withCore("apply batch")(
              Effect.gen(function* () {
                yield* siteFor(person, site, "page.edit");
                const doc = yield* siteDoc(env, site);
                return yield* Effect.tryPromise(async (): Promise<BatchOutcome> =>
                  doc.applyBatch(person.id, batch),
                );
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
