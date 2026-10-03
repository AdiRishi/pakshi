import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";
import type { Rpc, RpcGroup } from "effect/rpc";
import { RpcSerialization, RpcServer } from "effect/rpc";

export const rpcPath = "/rpc";

/** Serves a contract as Effect RPC over HTTP. Build it once per isolate. */
export const rpcWebHandler = <Rpcs extends Rpc.Any, R>(
  group: RpcGroup.RpcGroup<Rpcs>,
  handlers: Layer.Layer<Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs>, never, R>,
) =>
  HttpRouter.toWebHandler(
    HttpRouter.add(
      "POST",
      rpcPath,
      RpcServer.toHttpEffect(group).pipe(
        Effect.provide(Layer.merge(handlers, RpcSerialization.layerJson)),
        Effect.flatMap((handler) => handler),
      ),
    ),
  );
