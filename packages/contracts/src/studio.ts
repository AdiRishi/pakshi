import { Context, Schema } from "effect";
import { Rpc, RpcGroup, RpcMiddleware } from "effect/unstable/rpc";

import { SiteId } from "./ids.ts";

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

/** Everything Studio asks of studio-api. */
export class StudioRpcs extends RpcGroup.make(
  Rpc.make("viewer", { success: Viewer, error: StudioUnavailable }),
).middleware(StudioSession) {}
