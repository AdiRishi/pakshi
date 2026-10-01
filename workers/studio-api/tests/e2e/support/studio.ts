import type { DefaultRole, Scope } from "@repo/contracts/access";
import { accountsPaths, authBasePath, type SetUp } from "@repo/contracts/accounts";
import { clientOverBinding } from "@repo/contracts/rpc/client";
import { StudioRpcs, studioSessionHeaders } from "@repo/contracts/studio";
import { env, exports } from "cloudflare:workers";
import { Data, Effect, Schedule, type Schema } from "effect";

/*
 * Studio as E2E tests play it: the requests its server sends studio-api over
 * its two service bindings, the default entrypoint for sign-in and accounts
 * and the StudioRpc entrypoint for everything else.
 */

/** The address Studio is reached at, which studio-api checks requests come from. */
export const studioOrigin = "https://studio.pakshi.test";

/** Posts JSON to studio-api's plain HTTP routes as Studio forwards a browser's form. */
export const post = (path: string, body: Schema.JsonObject, session?: string) => {
  const headers = new Headers({ origin: studioOrigin, "content-type": "application/json" });
  if (session !== undefined) headers.set("cookie", session);
  return exports.default.fetch(
    new Request(`${studioOrigin}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
};

/** The session a response signed someone in with. */
export const sessionOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

/** Studio's RPC client for a person, or for a visitor who isn't signed in. */
export const studio = (session?: string) =>
  clientOverBinding(StudioRpcs, {
    binding: exports.StudioRpc,
    service: "studio-api",
    timeout: "10 seconds",
    headers: [
      [studioSessionHeaders.origin, studioOrigin],
      ...(session === undefined ? [] : [[studioSessionHeaders.cookie, session] as const]),
    ],
  });

/** Sets up the organization with its first admin, and returns their session. */
export const setUp = (account: SetUp) =>
  Effect.promise(async () => {
    const response = await post(accountsPaths.setUp, account);
    if (response.status !== 204) throw new Error(`Setting up returned ${response.status}.`);
    return sessionOf(response);
  });

/** Signs someone in with their email and password. */
export const signIn = (email: string, password: string) =>
  Effect.promise(async () => {
    const response = await post(`${authBasePath}/sign-in/email`, { email, password });
    if (!response.ok) throw new Error(`Signing in returned ${response.status}.`);
    return sessionOf(response);
  });

/** The emails sent to an address so far, oldest first. */
export const emailsTo = (address: string) =>
  Effect.promise(async () =>
    (await env.MAILBOX.messages()).filter((message) => [message.to].flat().includes(address)),
  );

/**
 * An effect's result once it succeeds, tried again for a few seconds. A
 * SiteDoc delivers its outbox from its alarm, after the request that filled
 * it has answered.
 */
export const eventually = <A, E>(effect: Effect.Effect<A, E>) =>
  effect.pipe(Effect.retry({ schedule: Schedule.spaced("50 millis"), times: 100 }), Effect.orDie);

/** The email to an address whose subject starts as given, once it arrives. */
export const emailArriving = (address: string, subject: string) =>
  eventually(
    Effect.flatMap(emailsTo(address), (emails) => {
      const email = emails.find((candidate) => candidate.subject.startsWith(subject));
      return email === undefined ? Effect.fail(new NoEmailYet()) : Effect.succeed(email);
    }),
  );

class NoEmailYet extends Data.TaggedError("NoEmailYet") {}

/** The first link in an email's text. */
export const linkIn = (text: string) => {
  const link = /https?:\/\/\S+/.exec(text)?.[0];
  if (link === undefined) throw new Error(`No link in: ${text}`);
  return link;
};

/** Invites someone with a role on a scope, and has them join from the link; returns their session. */
export const join = (
  inviter: Effect.Success<ReturnType<typeof studio>>,
  person: { readonly name: string; readonly email: string },
  role: DefaultRole,
  scope: Scope,
) =>
  Effect.gen(function* () {
    const { link } = yield* inviter.invite({ email: person.email, role, scope });
    const response = yield* Effect.promise(() =>
      post(accountsPaths.join, {
        token: link.split("/").at(-1) ?? "",
        name: person.name,
        password: `${person.name} password`,
      }),
    );
    if (response.status !== 204) return yield* Effect.die(`Joining returned ${response.status}.`);
    return sessionOf(response);
  });
