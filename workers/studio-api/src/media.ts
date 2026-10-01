import { D1Client } from "@effect/sql-d1";
import { BrandId, DraftId, MediaId, randomId, SiteId, SubmissionId } from "@repo/contracts/ids";
import { objectKeys } from "@repo/contracts/snapshot";
import {
  brandMediaBasePath,
  imageLimit,
  MediaSummary,
  mediaSegment,
  type Person,
  previewBasePath,
  reviewBasePath,
  siteMediaBasePath,
  type UploadRefusal,
} from "@repo/contracts/studio";
import { authorize, permissionsOn } from "@repo/domain/access";
import { imageInfo } from "@repo/domain/images";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Effect, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { getServerByName } from "partyserver";

import { loadAccess } from "./access.ts";
import { authFor } from "./auth.ts";
import { brandMedia, findSite, inSiteLibrary, siteOf, standingOn } from "./sites.ts";

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

/** An image in a brand's library, for anyone who holds a permission on the brand. */
export const serveBrandMedia = (request: Request, env: StudioApiEnv) =>
  answer(
    env,
    Effect.gen(function* () {
      const [brand = "", media = "", ...rest] = new URL(request.url).pathname
        .slice(brandMediaBasePath.length + 1)
        .split("/");
      const ids = Option.all({
        brand: Schema.decodeOption(BrandId)(brand),
        media: Schema.decodeOption(MediaId)(media),
      });
      if (Option.isNone(ids) || rest.length > 0) return notFound();
      const person = yield* signedIn(request, env);
      if (person === null) return signInFirst();
      const { access } = yield* loadAccess(person.id);
      if (permissionsOn(access, { kind: "brand", id: ids.value.brand }).length === 0)
        return notFound();
      const library = yield* brandMedia(ids.value.brand);
      if (!library.some((file) => file.id === ids.value.media)) return notFound();
      return yield* image(env, ids.value.media);
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

/** An image a site can place, from its library or its brand's, for anyone who holds a permission on the site. */
export const serveSiteMedia = (request: Request, env: StudioApiEnv) =>
  answer(
    env,
    Effect.gen(function* () {
      const [site = "", media = "", ...rest] = new URL(request.url).pathname
        .slice(siteMediaBasePath.length + 1)
        .split("/");
      const ids = Option.all({
        site: Schema.decodeOption(SiteId)(site),
        media: Schema.decodeOption(MediaId)(media),
      });
      if (Option.isNone(ids) || rest.length > 0) return notFound();
      const person = yield* signedIn(request, env);
      if (person === null) return signInFirst();
      const found = yield* Effect.option(siteOf(person, ids.value.site));
      if (Option.isNone(found) || !(yield* inSiteLibrary(found.value, ids.value.media)))
        return notFound();
      return yield* image(env, ids.value.media);
    }),
  );

const refuseUpload = (reason: UploadRefusal["reason"], status: number) =>
  Response.json({ reason } satisfies UploadRefusal, { status });

type Library =
  | { readonly kind: "site"; readonly id: SiteId }
  | { readonly kind: "brand"; readonly id: BrandId };

/** The library an upload goes to, from its address: a site's or a brand's. */
const uploadOwner = (url: URL): Option.Option<Library> => {
  const site = Schema.decodeUnknownOption(SiteId)(url.searchParams.get("site"));
  if (Option.isSome(site)) return Option.some({ kind: "site", id: site.value });
  return Option.map(
    Schema.decodeUnknownOption(BrandId)(url.searchParams.get("brand")),
    (id): Library => ({ kind: "brand", id }),
  );
};

/**
 * Adds an image to a site's library, for someone who may edit its pages, or
 * to a brand's, for someone who may edit its theme. The file's own bytes say
 * what it is; anything that isn't a JPEG, PNG, WebP or AVIF image is refused.
 */
export const serveUpload = (request: Request, env: StudioApiEnv) =>
  answer(
    env,
    Effect.gen(function* () {
      const url = new URL(request.url);
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      // Studio forwards the browser's own Origin, so a form on another site can't upload here.
      if (request.headers.get("origin") !== url.origin)
        return new Response("Forbidden", { status: 403 });
      const owner = uploadOwner(url);
      if (Option.isNone(owner)) return notFound();
      const person = yield* signedIn(request, env);
      if (person === null) return signInFirst();
      const { access } = yield* loadAccess(person.id);
      if (owner.value.kind === "site") {
        const site = yield* Effect.option(findSite(owner.value.id));
        if (
          Option.isNone(site) ||
          !(yield* standingOn(person, site.value)).permissions.includes("page.edit")
        )
          return refuseUpload("not-permitted", 403);
      } else if (!authorize(access, "brand.theme.edit", owner.value))
        return refuseUpload("not-permitted", 403);
      if (Number(request.headers.get("content-length") ?? "0") > imageLimit)
        return refuseUpload("too-large", 413);
      const bytes = new Uint8Array(yield* Effect.promise(() => request.arrayBuffer()));
      if (bytes.byteLength > imageLimit) return refuseUpload("too-large", 413);
      const info = imageInfo(bytes);
      if (info === null) return refuseUpload("not-image", 415);
      const id = MediaId.make(randomId("med"));
      const name = (url.searchParams.get("name") ?? "").slice(0, 200);
      yield* Effect.promise(() =>
        env.CONTENT.put(objectKeys.media(id), bytes, {
          httpMetadata: { contentType: info.contentType },
        }),
      );
      const sql = yield* SqlClient.SqlClient;
      yield* sql`insert into media (id, site_id, brand_id, content_type, width, height, name, size, uploaded_by)
        values (${id}, ${owner.value.kind === "site" ? owner.value.id : null},
          ${owner.value.kind === "brand" ? owner.value.id : null}, ${info.contentType},
          ${info.width}, ${info.height}, ${name}, ${bytes.byteLength}, ${person.id})`;
      const uploaded = yield* Schema.encodeEffect(MediaSummary)({ id, ...info, alt: "" });
      return Response.json(uploaded, { status: 201 });
    }),
  );
