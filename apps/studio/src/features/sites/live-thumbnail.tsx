import { renderPage, type SiteData, SitePage } from "@repo/blocks";
import type { SiteId } from "@repo/contracts/ids";
import type { SiteOverview } from "@repo/contracts/studio";
import { ScaledSiteFrame } from "@repo/editor";
import { Skeleton } from "@repo/ui/components/skeleton";
import { cn } from "cn";
import { Suspense, use, useMemo } from "react";

import { BrowserFrame } from "@/components/browser-frame";
import { siteMediaSrc } from "@/features/media/addresses";
import { viewData } from "@/features/preview/view-data";

import siteCss from "@repo/blocks/site.css?url";

type Home = NonNullable<SiteOverview["home"]>;

/** The width the page lays out at, a desktop's, before it's scaled down. */
const pageWidth = 1280;

/** Each live home page's blocks, rendered once however often the thumbnail renders. */
const renders = new WeakMap<Home, ReturnType<typeof renderPage>>();

const renderHome = (home: Home) => {
  const rendered = renders.get(home) ?? renderPage(home.page, home.parts, home.lockfile);
  renders.set(home, rendered);
  return rendered;
};

function HomePage(props: { readonly home: Home; readonly data: SiteData }) {
  return <SitePage site={props.data} {...use(renderHome(props.home))} />;
}

/**
 * The top of the live home page, as visitors see it on a desktop, in a small
 * browser window. With an address, clicking it opens the live site; the
 * Visit site button beside it is the way in for keyboards and screen readers.
 */
export function LiveThumbnail(props: {
  readonly site: SiteId;
  readonly home: Home;
  readonly address: string | null;
  readonly className?: string;
}) {
  const data = useMemo(
    () => viewData(props.home, (media) => siteMediaSrc(props.site, media)),
    [props.home, props.site],
  );
  const picture = (
    <BrowserFrame className="bg-background">
      <div className="relative aspect-video">
        <Skeleton className="absolute inset-0 rounded-none" />
        <ScaledSiteFrame
          title={`${props.home.settings.name}, as visitors see it`}
          siteCss={siteCss}
          theme={props.home.brand.theme}
          scheme="light"
          data={data}
          width={pageWidth}
          maxHeight={(pageWidth * 9) / 16}
        >
          <Suspense>
            <HomePage home={props.home} data={data} />
          </Suspense>
        </ScaledSiteFrame>
      </div>
    </BrowserFrame>
  );
  if (props.address === null) return <div className={props.className}>{picture}</div>;
  return (
    <a
      href={props.address}
      target="_blank"
      rel="noreferrer"
      tabIndex={-1}
      aria-hidden
      className={cn(
        "block rounded-lg transition-[box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        props.className,
      )}
    >
      {picture}
    </a>
  );
}
