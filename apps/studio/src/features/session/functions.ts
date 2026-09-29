import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { Effect } from "effect";

import { runApiRequest } from "@/server/api-request";

/** The signed-in person, or null when nobody is signed in. */
export const getViewer = createServerFn({ method: "GET" }).handler(() => {
  const request = getRequest();
  return runApiRequest(
    Effect.tryPromise(() =>
      env.STUDIO_API.viewer(new URL(request.url).origin, request.headers.get("cookie") ?? ""),
    ),
    request.signal,
  );
});

export const getOrganizationName = createServerFn({ method: "GET" }).handler(
  () => env.ORGANIZATION_NAME,
);
