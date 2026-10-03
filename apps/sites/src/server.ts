import type { SnapshotManifest } from "@repo/contracts/snapshot";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { env, waitUntil } from "cloudflare:workers";

import { type Answer, answerAt } from "./lib/addresses.ts";
import { siteDocument } from "./lib/feeds.ts";
import { takeFormPost } from "./lib/forms.ts";
import { serveMedia } from "./lib/media.ts";
import { pageCacheKey } from "./lib/page-cache.ts";
import { pagePolicy, secured } from "./lib/security.ts";
import { type LiveSite, liveSiteFor, loadManifest } from "./lib/snapshot.ts";

/**
 * The site for a page request's host, its live release's manifest, and what
 * the release answers at the request's address.
 */
interface PageRequest {
  readonly site: LiveSite;
  readonly manifest: SnapshotManifest;
  readonly answer: Exclude<Answer, { readonly kind: "redirect" }>;
}

declare module "@tanstack/react-start" {
  interface Register {
    server: { requestContext: PageRequest };
  }
}

const browserCaching = "public, max-age=0, must-revalidate";
const mediaPrefix = "/_media/";

/**
 * The page at the request's address as TanStack Start renders it, read whole
 * so its policy can name every inline script it holds. An address with no
 * page answers with the status that says why. Vite's dev server adds inline
 * scripts of its own as the page loads, so only built sites send a policy.
 */
const renderPage = async (request: Request, context: PageRequest) => {
  const rendered = await handler.fetch(request, { context });
  if (!rendered.headers.get("content-type")?.startsWith("text/html")) return rendered;
  const html = await rendered.text();
  const headers = new Headers(rendered.headers);
  if (!import.meta.env.DEV) headers.set("content-security-policy", await pagePolicy(html));
  const status = context.answer.kind === "missing" ? context.answer.status : rendered.status;
  return new Response(html, { status, headers });
};

/**
 * Finds the site for the request's host, serves its pages from the Workers
 * cache, and passes form posts on to sites-api. Only reads are cached.
 */
const serve = async (request: Request) => {
  const url = new URL(request.url);
  // Page paths are lowercase letters, digits and hyphens, so no page can take this prefix.
  if (url.pathname.startsWith(mediaPrefix)) return serveMedia(request, waitUntil);
  const site = await liveSiteFor(url.host);
  if (site === null) return new Response("There is no site at this address.", { status: 404 });

  if (request.method === "POST") return takeFormPost(request, site);
  const manifest = await loadManifest(site.id, site.live.snapshot);
  const reading = request.method === "GET" || request.method === "HEAD";
  if (reading) {
    const document = siteDocument(manifest, url);
    if (document !== null) return document;
  }
  const answer = answerAt(manifest, url.pathname);
  if (answer.kind === "redirect") return Response.redirect(new URL(answer.to, url).href, 301);
  const context = { site, manifest, answer };
  // A page that thanks someone for sending a form is theirs alone.
  if (!reading || url.searchParams.has("sent")) return renderPage(request, context);

  const key = new Request(
    pageCacheKey({ url, release: site.live.release, worker: env.CF_VERSION_METADATA.id }),
  );
  const cache = await caches.open("pages");
  const cached = await cache.match(key);
  if (cached !== undefined) {
    const hit = new Response(cached.body, cached);
    hit.headers.set("cache-control", browserCaching);
    hit.headers.set("x-pakshi-cache", "hit");
    return hit;
  }

  const rendered = await renderPage(request, context);
  const response = new Response(rendered.body, rendered);
  response.headers.set("cache-control", browserCaching);
  response.headers.set("x-pakshi-cache", "miss");
  if (response.status === 200 && request.method === "GET") {
    const stored = response.clone();
    stored.headers.set("cache-control", "public, max-age=86400");
    waitUntil(cache.put(key, stored));
  }
  return response;
};

/** Every site's Worker. Every response carries the headers that limit what the browser loads with it. */
export default createServerEntry({
  fetch: async (request) => secured(await serve(request)),
});
