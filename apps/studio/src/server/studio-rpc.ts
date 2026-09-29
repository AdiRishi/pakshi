import { AppRequestError } from "@repo/contracts/app";
import { type ClientFor, clientOverBinding, type ServiceBinding } from "@repo/contracts/rpc/client";
import {
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
        return error.code === "unauthenticated"
          ? Effect.fail(error)
          : Effect.logError("Studio call failed", cause).pipe(Effect.andThen(Effect.fail(error)));
      }),
    ),
    { signal: options.request.signal },
  );
};
