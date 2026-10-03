import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { type SiteEntry, SiteImage, useCollection, useCurrentPage } from "../../components.tsx";
import { choice, collection, number, optional, text } from "../../fields.ts";
import { buttonClass } from "../../kit/button.ts";
import { Icon } from "../../kit/icon.tsx";
import { Intro } from "../../kit/intro.tsx";
import { Section } from "../../kit/section.tsx";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  kicker: optional(text({ title: "Line above the heading", max: 40 })),
  heading: text({ title: "Heading", min: 3, max: 80 }),
  headingRest: optional(text({ title: "Rest of the heading", max: 140 })),
  intro: optional(text({ title: "Introduction", max: 240, multiline: true })),
  collection: collection({ title: "Blog", kind: "blog" }),
  count: number({ title: "How many", min: 1, max: 24 }),
  columns: choice({ title: "Columns", options: ["3", "2"] }),
};

type Variant = "cards" | "list" | "featured" | "text";
type Columns = BlockComponentProps<typeof props, Variant>["props"]["columns"];

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const columns = {
  "3": "sm:grid-cols-2 lg:grid-cols-3",
  "2": "sm:grid-cols-2",
} as const satisfies Record<Columns, string>;

const coverSizes = {
  "3": "(min-width: 64rem) 33vw, (min-width: 40rem) 50vw, 100vw",
  "2": "(min-width: 40rem) 50vw, 100vw",
} as const satisfies Record<Columns, string>;

/*
 * A post's title links to it, and the link stretches over the whole post, so
 * anywhere on it opens the post; its focus ring is drawn around the post.
 */
const stretchedLink = cx(
  "after:absolute after:inset-0 after:rounded-lg",
  "focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-ring",
);

const titleLink = cx(stretchedLink, "decoration-1 underline-offset-4 group-hover:underline");

/** The address of one page of a blog's posts. The first is the blog's own address. */
const pageHref = (blog: string, number: number) => (number === 1 ? blog : `${blog}?page=${number}`);

const Title = ({ post, className }: { readonly post: SiteEntry; readonly className: string }) => (
  <h3 className={cx("text-balance", className)}>
    <a className={titleLink} href={post.href}>
      {post.meta.title}
    </a>
  </h3>
);

/** When the post was published, and who wrote it when it says. */
const Byline = ({ post, author }: { readonly post: SiteEntry; readonly author: boolean }) => (
  <p className="text-small flex flex-wrap items-center gap-x-2 text-muted-foreground">
    <time dateTime={post.meta.date}>{dateFormat.format(new Date(post.meta.date))}</time>
    {author && post.meta.author && (
      <>
        <span aria-hidden>·</span>
        <span>{post.meta.author}</span>
      </>
    )}
  </p>
);

/** A post's cover, or a quiet panel in its place, so a row of posts keeps its line. */
const Cover = ({
  post,
  sizes,
  priority,
}: {
  readonly post: SiteEntry;
  readonly sizes: string;
  readonly priority?: boolean;
}) => (
  <div className="rounded-image aspect-3/2 overflow-hidden bg-foreground/5">
    {post.meta.cover ? (
      <SiteImage
        value={post.meta.cover}
        sizes={sizes}
        priority={priority}
        className="size-full object-cover transition-transform duration-500 group-hover:scale-103"
      />
    ) : (
      <div className="flex size-full items-center justify-center text-muted-foreground">
        <Icon name="newspaper" className="size-8 opacity-50" />
      </div>
    )}
  </div>
);

const Excerpt = ({ post, className }: { readonly post: SiteEntry; readonly className?: string }) =>
  post.meta.excerpt ? (
    <p className={cx("text-muted-foreground", className)}>{post.meta.excerpt}</p>
  ) : null;

const Card = ({
  post,
  columns: count,
}: {
  readonly post: SiteEntry;
  readonly columns: Columns;
}) => (
  <li className="group relative flex flex-col gap-5">
    <Cover post={post} sizes={coverSizes[count]} />
    <div className="flex flex-col gap-2">
      <Byline post={post} author />
      <Title post={post} className="text-heading" />
      <Excerpt post={post} className="text-body line-clamp-3" />
    </div>
  </li>
);

const TextCard = ({ post }: { readonly post: SiteEntry }) => (
  <li className="group card relative flex min-h-72 flex-col gap-4 p-6 transition-colors hover:bg-foreground/3 md:p-8">
    <Byline post={post} author={false} />
    <Title post={post} className="text-heading" />
    <div className="mt-auto flex flex-col gap-4 pt-6">
      <Excerpt post={post} className="text-body line-clamp-3" />
      {post.meta.author && <p className="text-small">{post.meta.author}</p>}
    </div>
  </li>
);

const Row = ({ post }: { readonly post: SiteEntry }) => (
  <li className="group relative flex flex-col gap-1 py-5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-10 md:py-6">
    <Title post={post} className="text-lead font-medium" />
    <time
      dateTime={post.meta.date}
      className="text-small shrink-0 text-muted-foreground tabular-nums"
    >
      {dateFormat.format(new Date(post.meta.date))}
    </time>
  </li>
);

/** The newest post, large, beside its cover. */
const Lead = ({ post }: { readonly post: SiteEntry }) => (
  <article className="group relative grid items-center gap-8 md:grid-cols-2 lg:gap-14">
    <Cover post={post} sizes="(min-width: 48rem) 50vw, 100vw" priority />
    <div className="flex flex-col items-start gap-4">
      <Byline post={post} author />
      <h3 className="text-title text-balance">
        <a className={titleLink} href={post.href}>
          {post.meta.title}
        </a>
      </h3>
      <Excerpt post={post} className="text-lead" />
      <span aria-hidden className={buttonClass({ variant: "link", className: "mt-2" })}>
        Read more
      </span>
    </div>
  </article>
);

const Posts = ({
  posts,
  variant,
  count,
  lead,
}: {
  readonly posts: ReadonlyArray<SiteEntry>;
  readonly variant: Variant;
  readonly count: Columns;
  readonly lead: boolean;
}) => {
  switch (variant) {
    case "list":
      return (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {posts.map((post) => (
            <Row key={post.id} post={post} />
          ))}
        </ul>
      );
    case "text":
      return (
        <ul className={cx("grid gap-4", columns[count])}>
          {posts.map((post) => (
            <TextCard key={post.id} post={post} />
          ))}
        </ul>
      );
    case "cards":
      return (
        <ul className={cx("grid gap-x-6 gap-y-12", columns[count])}>
          {posts.map((post) => (
            <Card key={post.id} post={post} columns={count} />
          ))}
        </ul>
      );
    case "featured": {
      const [first, ...rest] = posts;
      if (!lead || first === undefined)
        return <Posts posts={posts} variant="cards" count={count} lead={false} />;
      return (
        <div className="flex flex-col gap-14 md:gap-16">
          <Lead post={first} />
          {rest.length > 0 && (
            <ul
              className={cx(
                "grid gap-x-6 gap-y-12 border-t border-border pt-14 md:pt-16",
                columns[count],
              )}
            >
              {rest.map((post) => (
                <Card key={post.id} post={post} columns={count} />
              ))}
            </ul>
          )}
        </div>
      );
    }
  }
};

const PostList = ({ props: section, variant }: BlockComponentProps<typeof props, Variant>) => {
  const blog = useCollection(section.collection.id);
  const current = useCurrentPage();
  const posts = blog?.entries ?? [];
  // On the blog's own page the list pages through every post; elsewhere it shows the newest.
  const paged = current !== null && current.page === section.collection.id;
  const number = paged ? current.number : 1;
  const start = (number - 1) * section.count;
  const shown = posts.slice(start, start + section.count);
  const newer = paged && number > 1 && blog !== undefined ? pageHref(blog.href, number - 1) : null;
  const older =
    paged && posts.length > start + section.count && blog !== undefined
      ? pageHref(blog.href, number + 1)
      : null;
  const all = !paged && posts.length > section.count && blog !== undefined ? blog.href : null;
  const pager = buttonClass({ variant: "secondary", size: "sm" });
  return (
    <Section>
      <div className="page-width flex flex-col gap-14 md:gap-16">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-10">
          <Intro content={section} />
          {all !== null && (
            <a className={buttonClass({ variant: "link", className: "shrink-0" })} href={all}>
              See all posts
            </a>
          )}
        </div>
        {shown.length === 0 ? (
          <p className="text-body text-muted-foreground">
            {posts.length === 0 ? "There are no posts yet." : "There are no more posts."}
          </p>
        ) : (
          <Posts posts={shown} variant={variant} count={section.columns} lead={number === 1} />
        )}
        {(newer !== null || older !== null) && (
          <nav
            aria-label="More posts"
            className="flex justify-between gap-6 border-t border-border pt-8"
          >
            {newer === null ? (
              <span />
            ) : (
              <a className={cx(pager, "flex-row-reverse")} href={newer} rel="prev">
                Newer posts
                <Icon name="arrow-right" className="rotate-180" />
              </a>
            )}
            {older !== null && (
              <a className={pager} href={older} rel="next">
                Older posts
                <Icon name="arrow-right" />
              </a>
            )}
          </nav>
        )}
      </div>
    </Section>
  );
};

export default defineBlock({
  type: "post-list",
  version: 3,
  title: "Blog list",
  placement: "section",
  props,
  variants: ["cards", "list", "featured", "text"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  slots: {},
  agent: {
    purpose:
      "The newest posts of one of the site's blogs, with links to each. On the blog's own page it shows every post, a page at a time",
    avoid: [
      "two that show the same blog on one page",
      "the featured layout for a blog whose posts have no cover photos",
    ],
  },
  placeholder,
  component: PostList,
});
