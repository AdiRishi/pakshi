import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Root, SiteImage, useEntry } from "../../components.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {};

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const PostHeader = ({ variant }: BlockComponentProps<typeof props, "simple" | "cover">) => {
  const { meta } = useEntry();
  const cover = variant === "cover" ? meta.cover : undefined;
  return (
    <Root as="header" className="pt-section bg-background px-6 pb-12 text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-4">
          <p className="text-small text-muted-foreground">
            <time dateTime={meta.date}>{dateFormat.format(new Date(meta.date))}</time>
            {meta.author && `, ${meta.author}`}
          </p>
          <h1 className="text-title md:text-display text-balance">{meta.title}</h1>
          {meta.excerpt && <p className="text-lead text-muted-foreground">{meta.excerpt}</p>}
        </div>
        {cover && (
          <SiteImage
            value={cover}
            priority
            sizes="(min-width: 48rem) 48rem, 100vw"
            className="rounded-image aspect-video w-full object-cover"
          />
        )}
      </div>
    </Root>
  );
};

export default defineBlock({
  type: "post-header",
  version: 1,
  title: "Post header",
  placement: "section",
  entryOf: "blog",
  props,
  variants: ["simple", "cover"],
  surfaces: ["default", "muted", "brand", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose:
      "The top of a blog post: its title, date, author and excerpt, and its cover photo in the cover layout, all from the post's settings",
    avoid: ["anywhere but the top of a post"],
  },
  placeholder,
  component: PostHeader,
});
