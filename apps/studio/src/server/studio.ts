import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import type { Effect } from "effect";

import { callStudio, type StudioClient } from "./studio-rpc";

/** Calls studio-api for the request the running server function serves. */
export const studio = <A, E>(use: (client: StudioClient) => Effect.Effect<A, E>) =>
  callStudio({ binding: env.STUDIO_RPC, request: getRequest() }, use);
