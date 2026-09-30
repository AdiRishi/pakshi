import { AppRequestError } from "@repo/contracts/app";
import { type ClientFor, clientOverBinding, type ServiceBinding } from "@repo/contracts/rpc/client";
import {
  CannotDecide,
  DraftNotFound,
  NothingToRollBack,
  NotPermitted,
  ReleaseNotFound,
  ScopeNotFound,
  SiteNotFound,
  SubmissionNotFound,
  StudioRpcs,
  studioSessionHeaders,
  StudioUnavailable,
  Unauthenticated,
} from "@repo/contracts/studio";
import { Cause, type Duration, Effect, Schema } from "effect";
import { RpcClientError } from "effect/unstable/rpc";

export type StudioClient = ClientFor<typeof StudioRpcs>;

/** The one place a failed Studio call becomes an error that's safe to send to the browser. */
const toAppError = (cause: Cause.Cause<unknown>) => {
  const failure = Cause.squash(cause);
  if (Schema.is(Unauthenticated)(failure))
    return new AppRequestError("unauthenticated", "Your session has ended. Sign in again.");
  if (Schema.is(SiteNotFound)(failure))
    return new AppRequestError("not_found", "There's no site here that you can work on.");
  if (Schema.is(DraftNotFound)(failure))
    return new AppRequestError(
      "not_found",
      "This draft was published or closed, or doesn't exist.",
    );
  if (Schema.is(ReleaseNotFound)(failure))
    return new AppRequestError("not_found", "This site has no such release.");
  if (Schema.is(SubmissionNotFound)(failure))
    return new AppRequestError("not_found", "This site has no such submission.");
  if (Schema.is(ScopeNotFound)(failure))
    return new AppRequestError("not_found", "There's nothing here that you can work on.");
  if (Schema.is(NotPermitted)(failure))
    return new AppRequestError("forbidden", `You don't have permission to ${failure.action}.`);
  if (Schema.is(CannotDecide)(failure)) return new AppRequestError("forbidden", failure.reason);
  if (Schema.is(NothingToRollBack)(failure))
    return new AppRequestError(
      "conflict",
      "Only the latest publish can be rolled back, and it already has been.",
    );
  if (Schema.is(StudioUnavailable)(failure) || failure instanceof RpcClientError.RpcClientError)
    return new AppRequestError(
      "unavailable",
      "The service is temporarily unavailable. Please try again.",
    );
  return new AppRequestError("internal", "The request could not be completed.");
};

/**
 * Calls studio-api for the browser request being served. The session cookie
 * and Studio's origin travel as headers, so studio-api's session middleware
 * can find the signed-in person. A cancelled request interrupts the call.
 */
export const callStudio = <A, E>(
  options: {
    readonly binding: ServiceBinding;
    readonly request: Request;
    readonly timeout?: Duration.Input;
  },
  use: (studio: StudioClient) => Effect.Effect<A, E>,
): Promise<A> => {
  const headers: Array<readonly [string, string]> = [
    [studioSessionHeaders.origin, new URL(options.request.url).origin],
  ];
  const cookie = options.request.headers.get("cookie");
  if (cookie !== null) headers.push([studioSessionHeaders.cookie, cookie]);
  return Effect.runPromise(
    clientOverBinding(StudioRpcs, {
      binding: options.binding,
      service: "studio-api",
      timeout: options.timeout ?? "10 seconds",
      headers,
    }).pipe(
      Effect.flatMap(use),
      Effect.scoped,
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) return Effect.interrupt;
        const error = toAppError(cause);
        return error.code === "unavailable" || error.code === "internal"
          ? Effect.logError("Studio call failed", cause).pipe(Effect.andThen(Effect.fail(error)))
          : Effect.fail(error);
      }),
    ),
    { signal: options.request.signal },
  );
};
