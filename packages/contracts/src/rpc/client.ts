import { Duration, Effect, Layer } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientError,
  HttpClientRequest,
} from "effect/unstable/http";
import type { Rpc, RpcGroup } from "effect/unstable/rpc";
import { RpcClient, RpcClientError, RpcSerialization } from "effect/unstable/rpc";

import { rpcPath } from "./server.ts";

export type ClientFor<Group> = RpcClient.RpcClient<
  RpcGroup.Rpcs<Group>,
  RpcClientError.RpcClientError
>;

/** A service binding, or anything else that answers requests the way one does. */
export interface ServiceBinding {
  readonly fetch: (request: Request) => Promise<Response>;
}

const timedOut = (request: HttpClientRequest.HttpClientRequest, timeout: Duration.Input) => {
  const description = `No RPC response within ${Duration.format(Duration.fromInputUnsafe(timeout))}.`;
  return new HttpClientError.HttpClientError({
    reason: new HttpClientError.TransportError({
      cause: new Error(description),
      description,
      request,
    }),
  });
};

const httpClientOverBinding = (options: {
  readonly binding: ServiceBinding;
  readonly timeout: Duration.Input;
  readonly headers: ReadonlyArray<readonly [string, string]>;
}) =>
  Layer.effect(
    HttpClient.HttpClient,
    Effect.map(HttpClient.HttpClient, (client) =>
      HttpClient.transform(
        HttpClient.mapRequest(client, (request) =>
          options.headers.reduce(
            (current, [name, value]) => HttpClientRequest.setHeader(current, name, value),
            request,
          ),
        ),
        (effect, request) =>
          Effect.timeoutOrElse(effect, {
            duration: options.timeout,
            orElse: () => Effect.fail(timedOut(request, options.timeout)),
          }),
      ),
    ),
  ).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(
      Layer.succeed(FetchHttpClient.Fetch)((input, init) =>
        options.binding.fetch(new Request(input, init)),
      ),
    ),
  );

/**
 * An Effect RPC client for a contract, sent over a service binding. The host
 * in the URL is only a label; the binding decides where the request goes.
 * A call that gets no response within `timeout` fails with an RpcClientError.
 */
export const clientOverBinding = <Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options: {
    readonly binding: ServiceBinding;
    readonly service: string;
    readonly timeout: Duration.Input;
    /** Sent with every call, such as the caller's session cookie. */
    readonly headers: ReadonlyArray<readonly [string, string]>;
  },
) =>
  RpcClient.make(group).pipe(
    Effect.provide(
      RpcClient.layerProtocolHttp({ url: `http://${options.service}.internal${rpcPath}` }).pipe(
        Layer.provide(RpcSerialization.layerJson),
        Layer.provide(httpClientOverBinding(options)),
      ),
    ),
  );
