import { D1Client } from "@effect/sql-d1";
import type { Permission } from "@repo/contracts/access";
import { type BrandId, DraftId, SiteId } from "@repo/contracts/ids";
import type { Person } from "@repo/contracts/studio";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Effect, Option, Result, Schema } from "effect";
import { getServerByName } from "partyserver";

import { authFor } from "./auth.ts";
import { findSite, standingOn } from "./sites.ts";

/** Someone studio-api has let edit a draft, and what they hold on its site. */
export interface Editor {
  readonly person: Person;
  readonly site: { readonly id: SiteId; readonly brand: BrandId };
  readonly draft: DraftId;
  readonly permissions: ReadonlyArray<Permission>;
  /** Whether they edit the site's pages, rather than this draft through a share. */
  readonly editsSite: boolean;
}

/**
 * Who is asking, at `${basePath}/{site}/{draft}` and below, to edit an open
 * draft: someone signed in to Studio, through Studio's own origin, who may
 * edit it through `page.edit` on the site or a share. Anything else gets the
 * response refusing it. Browsers send cookies with a WebSocket or form post
 * from any page, so the origin must be Studio's.
 */
export const editorOf = async (
  request: Request,
  env: StudioApiEnv,
  basePath: string,
): Promise<Result.Result<Editor, Response>> => {
  const url = new URL(request.url);
  if (request.headers.get("origin") !== url.origin)
    return Result.fail(new Response("Not allowed from this origin.", { status: 403 }));
  const session = await authFor(env, url.origin).api.getSession({ headers: request.headers });
  if (session === null) return Result.fail(new Response("Sign in to edit.", { status: 401 }));
  const [siteId = "", draftId = ""] = url.pathname.slice(basePath.length + 1).split("/");
  const site = Schema.decodeOption(SiteId)(siteId);
  const draft = Schema.decodeOption(DraftId)(draftId);
  const notFound = Result.fail(new Response("Not found", { status: 404 }));
  if (Option.isNone(site) || Option.isNone(draft)) return notFound;
  const { id, name, email } = session.user;
  const person = { id, name, email };
  const found = await Effect.runPromise(
    Effect.gen(function* () {
      const found = yield* findSite(site.value);
      return { site: found, standing: yield* standingOn(person, found) };
    }).pipe(
      Effect.asSome,
      Effect.catchTag("SiteNotFound", () => Effect.succeedNone),
      Effect.provide(D1Client.layer({ db: env.CORE })),
    ),
  );
  if (Option.isNone(found)) return notFound;
  const { permissions } = found.value.standing;
  const editsSite = permissions.includes("page.edit");
  const doc = await getServerByName(env.SITE_DOC, site.value);
  if ((await doc.access(draft.value, { id, editsSite })) !== "edit") return notFound;
  return Result.succeed({
    person,
    site: { id: found.value.site.id, brand: found.value.site.brand },
    draft: draft.value,
    permissions,
    editsSite,
  });
};
