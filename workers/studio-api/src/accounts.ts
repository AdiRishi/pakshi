import { D1Client } from "@effect/sql-d1";
import { type AccountRefusal, accountsPaths, Join, SetUp } from "@repo/contracts/accounts";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { isAPIError } from "better-auth/api";
import { Data, Effect, Option, Schema } from "effect";

import { authFor } from "./auth.ts";
import { acceptInvitation, invitationToJoin } from "./invitations.ts";
import { organizationName, startOrganization } from "./organization.ts";

/*
 * Making accounts. Better Auth's own sign-up is closed to browsers, so these
 * are the only two ways in: setting up the organization on an empty stage,
 * and joining it from an invitation. Each signs the new person in.
 */

/** Better Auth refused to make an account, because the address has one or for another reason. */
class SignUpFailed extends Data.TaggedError("SignUpFailed")<{
  readonly accountExists: boolean;
  readonly cause: unknown;
}> {}

const refuse = (reason: AccountRefusal["reason"]) =>
  Response.json({ reason } satisfies AccountRefusal, { status: reason === "invalid" ? 400 : 409 });

/** A new account with an email and password, and the cookies that sign it in, or null when the address has one. */
const signUp = (
  env: StudioApiEnv,
  origin: string,
  account: { readonly name: string; readonly email: string; readonly password: string },
) =>
  Effect.tryPromise({
    try: () => authFor(env, origin).api.signUpEmail({ body: account, returnHeaders: true }),
    catch: (cause) =>
      new SignUpFailed({
        accountExists: isAPIError(cause) && cause.status === "UNPROCESSABLE_ENTITY",
        cause,
      }),
  }).pipe(
    Effect.map(({ headers, response }) => ({
      user: response.user,
      cookies: headers.getSetCookie(),
    })),
    Effect.catchIf(
      (error) => error.accountExists,
      () => Effect.succeed(null),
    ),
    Effect.orDie,
  );

const signedIn = (cookies: ReadonlyArray<string>) => {
  const headers = new Headers();
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 204, headers });
};

/** Sets up an empty stage: the first person's account, and the organization they're the admin of. */
const setUp = (env: StudioApiEnv, origin: string, body: SetUp) =>
  Effect.gen(function* () {
    if (Option.isSome(yield* organizationName)) return refuse("set-up");
    const account = yield* signUp(env, origin, body);
    if (account === null) return refuse("account-exists");
    if (!(yield* startOrganization(body.organization, account.user))) return refuse("set-up");
    return signedIn(account.cookies);
  });

/** Makes the account an invitation was sent to, with the invitation's grant. */
const join = (env: StudioApiEnv, origin: string, body: Join) =>
  Effect.gen(function* () {
    const invitation = yield* invitationToJoin(body.token);
    const account = yield* signUp(env, origin, {
      name: body.name,
      email: invitation.email,
      password: body.password,
    });
    if (account === null) return refuse("account-exists");
    yield* acceptInvitation(account.user, body.token);
    return signedIn(account.cookies);
  }).pipe(Effect.catchTag("InvitationClosed", () => Effect.succeed(refuse("invitation"))));

const decodeBody = <S extends Schema.Top & { readonly DecodingServices: never }>(
  schema: S,
  request: Request,
) =>
  Effect.promise(() => request.text()).pipe(
    Effect.map(Schema.decodeUnknownOption(Schema.fromJsonString(schema))),
  );

/** Answers a request to set up the organization or join it. */
export const serveAccounts = (request: Request, env: StudioApiEnv) => {
  const url = new URL(request.url);
  if (request.method !== "POST")
    return Promise.resolve(new Response("Method not allowed", { status: 405 }));
  // Studio forwards the browser's own Origin, so a form on another site can't make an account here.
  if (request.headers.get("origin") !== url.origin)
    return Promise.resolve(new Response("Forbidden", { status: 403 }));
  const program = Effect.gen(function* () {
    switch (url.pathname) {
      case accountsPaths.setUp: {
        const body = yield* decodeBody(SetUp, request);
        return Option.isNone(body) ? refuse("invalid") : yield* setUp(env, url.origin, body.value);
      }
      case accountsPaths.join: {
        const body = yield* decodeBody(Join, request);
        return Option.isNone(body) ? refuse("invalid") : yield* join(env, url.origin, body.value);
      }
      default:
        return new Response("Not found", { status: 404 });
    }
  });
  return Effect.runPromise(
    program.pipe(Effect.orDie, Effect.provide(D1Client.layer({ db: env.CORE }))),
  );
};
