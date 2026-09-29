import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { Effect } from "effect";

import { callStudio } from "@/server/studio-rpc";

/** The signed-in person, or null when nobody is signed in. */
export const getViewer = createServerFn({ method: "GET" }).handler(() =>
  callStudio({ binding: env.STUDIO_RPC, request: getRequest() }, (studio) =>
    studio.viewer().pipe(Effect.catchTag("Unauthenticated", () => Effect.succeed(null))),
  ),
);

export const getOrganizationName = createServerFn({ method: "GET" }).handler(
  () => env.ORGANIZATION_NAME,
);
