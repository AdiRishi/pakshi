import { D1Client } from "@effect/sql-d1";
import { rpcWebHandler } from "@repo/contracts/rpc/server";
import {
  SignedIn,
  StudioRpcs,
  StudioSession,
  studioSessionHeaders,
  StudioUnavailable,
  Unauthenticated,
} from "@repo/contracts/studio";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { type Cause, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";

import { authFor } from "./auth.ts";
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

const handlers = (env: StudioApiEnv) =>
  StudioRpcs.toLayer(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      return StudioRpcs.of({
        viewer: () =>
          SignedIn.use((person) =>
            describeViewer(person).pipe(
              Effect.provideService(SqlClient.SqlClient, sql),
              Effect.catchTags({
                SqlError: unavailable("viewer"),
                // A row that doesn't match its schema is a bug, not an outage.
                SchemaError: Effect.die,
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
