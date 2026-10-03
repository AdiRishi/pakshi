import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { type SiteEntry, SiteImage, useEntry } from "../../components.tsx";
import { Section } from "../../kit/section.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {};

type Variant = "simple" | "centered" | "cover" | "split";
type Meta = SiteEntry["meta"];

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** The post's tags, its title, its excerpt and a line of when it was published and by whom. */
const Words = ({
  meta,
  center,
  size,
}: {
  readonly meta: Meta;
  readonly center: boolean;
  readonly size: "text-title" | "text-display";
}) => (
  <div className={cx("flex flex-col gap-6", center ? "items-center text-center" : "items-start")}>
    {meta.tags.length > 0 && (
      <ul className={cx("flex flex-wrap gap-2", center && "justify-center")}>
        {meta.tags.map((tag) => (
          <li
            key={tag}
            className="text-small rounded-full border border-foreground/12 px-3 py-0.5 text-muted-foreground"
          >
            {tag}
          </li>
        ))}
      </ul>
    )}
    <h1 className={size}>{meta.title}</h1>
    {meta.excerpt && <p className="text-lead max-w-2xl text-muted-foreground">{meta.excerpt}</p>}
    <p
      className={cx(
        "mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted-foreground",
        center && "justify-center",
      )}
    >
      <time dateTime={meta.date}>{dateFormat.format(new Date(meta.date))}</time>
      {meta.author && (
        <>
          <span aria-hidden className="h-4 w-px bg-border" />
          <span className="text-foreground">{meta.author}</span>
        </>
      )}
    </p>
  </div>
);

/** The top of a blog post, from the post's own settings. */
const PostHeader = ({ variant }: BlockComponentProps<typeof props, Variant>) => {
  const { meta } = useEntry();
  const { cover } = meta;
  // Most layouts sit close above the post's text, which keeps the section's space below them.
  const spacing = "pt-section pb-12 md:pb-16";
  switch (variant) {
    case "simple":
      return (
        <Section spacing="flush" className={spacing}>
          <div className="page-width">
            <div className="mx-auto max-w-2xl">
              <Words meta={meta} center={false} size="text-title" />
            </div>
          </div>
        </Section>
      );
    case "centered":
      return (
        <Section spacing="flush" className={spacing}>
          <div className="page-width">
            <div className="mx-auto max-w-3xl">
              <Words meta={meta} center size="text-display" />
            </div>
          </div>
        </Section>
      );
    case "cover":
      return (
        <Section spacing="flush" className={spacing}>
          <div className="page-width flex flex-col gap-12 md:gap-16">
            <div className="mx-auto w-full max-w-2xl">
              <Words meta={meta} center={false} size="text-title" />
            </div>
            {cover && (
              <SiteImage
                value={cover}
                priority
                sizes="(min-width: 90rem) 88rem, 100vw"
                className="rounded-image aspect-3/2 w-full object-cover outline-1 -outline-offset-1 outline-foreground/10 md:aspect-2/1"
              />
            )}
          </div>
        </Section>
      );
    case "split":
      // A band of its own, with the section's space below as well as above.
      return (
        <Section>
          <div
            className={cx(
              "page-width grid items-center gap-10 lg:gap-16",
              cover && "md:grid-cols-2",
            )}
          >
            <Words meta={meta} center={false} size="text-display" />
            {cover && (
              <SiteImage
                value={cover}
                priority
                sizes="(min-width: 48rem) 50vw, 100vw"
                className="rounded-image aspect-4/3 w-full object-cover outline-1 -outline-offset-1 outline-foreground/10"
              />
            )}
          </div>
        </Section>
      );
  }
};

export default defineBlock({
  type: "post-header",
  version: 2,
  title: "Post header",
  placement: "section",
  entryOf: "blog",
  props,
  variants: ["simple", "centered", "cover", "split"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: {},
  agent: {
    purpose:
      "The top of a blog post: its title, excerpt, date and author, and its cover photo in the cover and split layouts, all from the post's settings",
    avoid: [
      "anywhere but the top of a post",
      "the cover and split layouts for a post without a cover photo",
    ],
  },
  placeholder,
  component: PostHeader,
});
