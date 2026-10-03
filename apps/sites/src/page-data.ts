import { interactiveParts, type ResolvedMedia } from "@repo/blocks";
import { pageNumberOf } from "@repo/contracts/collections";
import { FormId, MediaId } from "@repo/contracts/ids";
import { pageName } from "@repo/contracts/page";
import { themeCss } from "@repo/tokens";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { Option, Schema } from "effect";

import { responsiveImage } from "./lib/responsive.ts";
import { feedAddress, pageMeta } from "./lib/seo.ts";
import { loadPage } from "./lib/snapshot.ts";

/**
 * Everything the page at the request's address shows, from the site's live
 * release: its head, and its blocks with what they read of the site, or why
 * there's no page there.
 */
export const getSitePage = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  const { site, manifest, answer } = context;
  const url = new URL(getRequest().url);
  const head = {
    siteName: manifest.settings.name,
    theme: themeCss(manifest.brand.theme),
    favicon: manifest.brand.identity.favicon,
    feeds: manifest.pages.flatMap((listing) =>
      listing.type === "collection"
        ? [{ title: pageName(listing), href: feedAddress(listing.path) }]
        : [],
    ),
  };
  if (answer.kind === "missing")
    return {
      kind: "missing" as const,
      head,
      title: answer.unpublished
        ? manifest.settings.name
        : answer.status === 410
          ? "Page removed"
          : "Page not found",
      message: answer.unpublished
        ? "This site hasn't been published yet."
        : answer.status === 410
          ? "This page has been taken down."
          : "There's no page at this address.",
      home: !answer.unpublished,
    };
  const { entry } = answer;
  const page = await loadPage(site.id, entry.object);
  const media: Record<MediaId, ResolvedMedia> = Object.fromEntries(
    Object.entries(manifest.media).map(([id, file]) => [
      id,
      responsiveImage(MediaId.make(id), file),
    ]),
  );
  return {
    kind: "page" as const,
    head,
    title: page.meta.title,
    description: page.meta.description,
    seo: pageMeta(page, entry, manifest, url.origin),
    page,
    parts: manifest.parts,
    lockfile: manifest.lockfile,
    interactive: await interactiveParts(page, manifest.parts, manifest.lockfile),
    site: {
      settings: manifest.settings,
      identity: manifest.brand.identity,
      menus: manifest.parts.menus,
      pages: manifest.pages,
      forms: manifest.forms,
      media,
    },
    sent: Option.getOrNull(Schema.decodeUnknownOption(FormId)(url.searchParams.get("sent"))),
    current: { page: entry.id, number: pageNumberOf(url) },
  };
});

export type SitePageData = Awaited<ReturnType<typeof getSitePage>>;
