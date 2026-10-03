import { siteData, SitePage } from "@repo/blocks";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { getSitePage, type SitePageData } from "../page-data.ts";

type Shown = Extract<SitePageData, { readonly kind: "page" }>;

const fullTitle = (data: SitePageData) =>
  data.title === data.head.siteName ? data.title : `${data.title} · ${data.head.siteName}`;

/** The tags search engines and link previews read, for a page that's there. */
const sharing = (data: Shown) => [
  { name: "description", content: data.description },
  { property: "og:type", content: data.seo.type },
  { property: "og:site_name", content: data.head.siteName },
  { property: "og:title", content: data.title },
  { property: "og:description", content: data.description },
  { property: "og:url", content: data.seo.canonical },
  ...(data.seo.noindex ? [{ name: "robots", content: "noindex" }] : []),
  ...(data.seo.image === null
    ? []
    : [
        { property: "og:image", content: data.seo.image.src },
        { property: "og:image:width", content: String(data.seo.image.width) },
        { property: "og:image:height", content: String(data.seo.image.height) },
        { property: "og:image:alt", content: data.seo.image.alt },
      ]),
  { name: "twitter:card", content: data.seo.image === null ? "summary" : "summary_large_image" },
];

export const Route = createFileRoute("/$")({
  loader: () => getSitePage(),
  head: ({ loaderData }) =>
    loaderData === undefined
      ? {}
      : {
          meta: [
            { title: fullTitle(loaderData) },
            ...(loaderData.kind === "page" ? sharing(loaderData) : []),
          ],
          links: [
            ...(loaderData.kind === "page"
              ? [{ rel: "canonical", href: loaderData.seo.canonical }]
              : []),
            ...loaderData.head.feeds.map((feed) => ({
              rel: "alternate",
              type: "application/rss+xml",
              title: feed.title,
              href: feed.href,
            })),
            ...(loaderData.head.favicon === null
              ? []
              : [{ rel: "icon", href: `/_media/${loaderData.head.favicon}` }]),
          ],
          styles: [{ children: loaderData.head.theme }],
        },
  component: function SiteRoute() {
    const data = Route.useLoaderData();
    return data.kind === "page" ? (
      <Page data={data} />
    ) : (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
        <h1 className="text-title">{data.title}</h1>
        <p className="text-lead text-muted-foreground">{data.message}</p>
        {data.home && (
          <a className="text-primary underline" href="/">
            Go to the home page
          </a>
        )}
      </main>
    );
  },
});

/** A page's blocks, with what they read of the site. */
function Page({ data }: { readonly data: Shown }) {
  const { site: inputs, sent, current: shown, motion } = data;
  const site = useMemo(
    () => ({
      ...siteData({ ...inputs, media: (id) => inputs.media[id] }),
      sent,
      current: shown,
      motion,
    }),
    [inputs, sent, shown, motion],
  );
  return <SitePage site={site} page={data.page} parts={data.parts} lockfile={data.lockfile} />;
}
