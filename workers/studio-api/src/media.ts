import { D1Client } from "@effect/sql-d1";
import { DraftId, MediaId, SiteId, SubmissionId } from "@repo/contracts/ids";
import { objectKeys } from "@repo/contracts/snapshot";
import { mediaSegment, type Person, previewBasePath, reviewBasePath } from "@repo/contracts/studio";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Effect, Option, Schema } from "effect";
import type { SqlClient } from "effect/unstable/sql";
import { getServerByName } from "partyserver";

import { authFor } from "./auth.ts";
import { findSite, inSiteLibrary, siteOf, standingOn } from "./sites.ts";

const notFound = () => new Response("Not found", { status: 404 });
const signInFirst = () => new Response("Sign in to see this image.", { status: 401 });

/** A library image from the content bucket. Files never change, so browsers keep each one. */
const image = (env: StudioApiEnv, id: MediaId) =>
  Effect.promise(async () => {
    const object = await env.CONTENT.get(objectKeys.media(id));
    if (object === null) return notFound();
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, max-age=31536000, immutable");
    return new Response(object.body, { headers });
  });

/** The person the request's session cookie belongs to, or null. */
const signedIn = (request: Request, env: StudioApiEnv) =>
  Effect.promise(async (): Promise<Person | null> => {
    const session = await authFor(env, new URL(request.url).origin).api.getSession({
      headers: request.headers,
    });
    if (session === null) return null;
    const { id, name, email } = session.user;
    return { id, name, email };
  });

/** Answers a request from D1 and the bindings. A storage failure is a server error. */
const answer = <E>(env: StudioApiEnv, program: Effect.Effect<Response, E, SqlClient.SqlClient>) =>
  Effect.runPromise(program.pipe(Effect.orDie, Effect.provide(D1Client.layer({ db: env.CORE }))));

/** The parts of `{base}/{site}/{thing}/_media/{media}`, or none when the path isn't one. */
const imagePath = <A>(pathname: string, base: string, thing: Schema.Decoder<A>) => {
  const [site = "", id = "", segment = "", media = "", ...rest] = pathname
    .slice(base.length + 1)
    .split("/");
  if (segment !== mediaSegment || rest.length > 0) return Option.none();
  return Option.all({
    site: Schema.decodeOption(SiteId)(site),
    thing: Schema.decodeOption(thing)(id),
    media: Schema.decodeOption(MediaId)(media),
  });
};

/**
 * An image in a draft, for its preview and its editor: for anyone who may
 * open the draft, signed in or not. Only images in the site's library or its
 * brand's are served, so a shared draft can't show anything else.
 */
export const servePreviewMedia = (request: Request, env: StudioApiEnv) =>
  answer(
    env,
    Effect.gen(function* () {
      const path = imagePath(new URL(request.url).pathname, previewBasePath, DraftId);
      if (Option.isNone(path)) return notFound();
      const { site: siteId, thing: draft, media } = path.value;
      const site = yield* Effect.option(findSite(siteId));
      if (Option.isNone(site)) return notFound();
      const person = yield* signedIn(request, env);
      const editsSite =
        person !== null &&
        (yield* standingOn(person, site.value)).permissions.includes("page.edit");
      const doc = yield* Effect.promise(() => getServerByName(env.SITE_DOC, siteId));
      const access = yield* Effect.promise(() =>
        doc.access(draft, person === null ? { id: null } : { id: person.id, editsSite }),
      );
      if (access === null || !(yield* inSiteLibrary(site.value, media))) return notFound();
      return yield* image(env, media);
    }),
  );

/** An image in a submission, or the live site beside it, for anyone who holds a permission on the site. */
export const serveReviewMedia = (request: Request, env: StudioApiEnv) =>
  answer(
    env,
    Effect.gen(function* () {
      const path = imagePath(new URL(request.url).pathname, reviewBasePath, SubmissionId);
      if (Option.isNone(path)) return notFound();
      const person = yield* signedIn(request, env);
      if (person === null) return signInFirst();
      const site = yield* Effect.option(siteOf(person, path.value.site));
      if (Option.isNone(site) || !(yield* inSiteLibrary(site.value, path.value.media)))
        return notFound();
      return yield* image(env, path.value.media);
    }),
  );
