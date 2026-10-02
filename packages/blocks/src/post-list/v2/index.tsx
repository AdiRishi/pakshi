import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import {
  Root,
  type SiteEntry,
  SiteImage,
  Text,
  useCollection,
  useCurrentPage,
} from "../../components.tsx";
import { collection, number, optional, text } from "../../fields.ts";
import { placeholderCollection } from "../../placeholders.ts";
import placeholder from "./fixtures/placeholder.json" with { type: "json" };

const props = {
  heading: text({ title: "Heading", min: 3, max: 80 }),
  intro: optional(text({ title: "Introduction", max: 240, multiline: true })),
  collection: collection({ title: "Blog", kind: "blog" }),
  count: number({ title: "How many", min: 1, max: 24 }),
};

type Variant = "list" | "cards";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const link =
  "text-body font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** The address of one page of a blog's posts. The first is the blog's own address. */
const pageHref = (blog: string, number: number) => (number === 1 ? blog : `${blog}?page=${number}`);

const Post = ({ post, variant }: { readonly post: SiteEntry; readonly variant: Variant }) => {
  const { meta } = post;
  const details = (
    <>
      <h3 className="text-heading text-balance">
        <a
          className="hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          href={post.href}
        >
          {meta.title}
        </a>
      </h3>
      <p className="text-small text-muted-foreground">
        <time dateTime={meta.date}>{dateFormat.format(new Date(meta.date))}</time>
        {meta.author && `, ${meta.author}`}
      </p>
      {meta.excerpt && <p className="text-body">{meta.excerpt}</p>}
    </>
  );
  if (variant === "list") return <li className="flex flex-col gap-2 py-6">{details}</li>;
  return (
    <li className="flex flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
      {meta.cover && (
        <SiteImage
          value={meta.cover}
          sizes="(min-width: 640px) 28rem, 100vw"
          className="aspect-video w-full object-cover"
        />
      )}
      <div className="flex flex-col gap-2 p-6">{details}</div>
    </li>
  );
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
  return (
    <Root className="py-section bg-background px-6 text-foreground">
      <div className="mx-auto flex max-w-4xl flex-col gap-10">
        <div className="flex flex-col gap-3">
          <Text
            field="heading"
            as="h2"
            value={section.heading}
            className="text-title text-balance"
          />
          {section.intro && (
            <Text
              field="intro"
              as="p"
              value={section.intro}
              className="text-lead whitespace-pre-line text-muted-foreground"
            />
          )}
        </div>
        {shown.length === 0 ? (
          <p className="text-body text-muted-foreground">
            {posts.length === 0 ? "There are no posts yet." : "There are no more posts."}
          </p>
        ) : (
          <ul
            className={
              variant === "cards"
                ? "grid gap-6 sm:grid-cols-2"
                : "flex flex-col divide-y divide-border"
            }
          >
            {shown.map((post) => (
              <Post key={post.id} post={post} variant={variant} />
            ))}
          </ul>
        )}
        {all !== null && (
          <a className={`${link} self-start`} href={all}>
            See all posts
          </a>
        )}
        {(newer !== null || older !== null) && (
          <nav aria-label="More posts" className="flex justify-between gap-6">
            {newer === null ? (
              <span />
            ) : (
              <a className={link} href={newer} rel="prev">
                Newer posts
              </a>
            )}
            {older !== null && (
              <a className={link} href={older} rel="next">
                Older posts
              </a>
            )}
          </nav>
        )}
      </div>
    </Root>
  );
};

export default defineBlock({
  type: "post-list",
  version: 2,
  title: "Blog list",
  placement: "section",
  props,
  variants: ["list", "cards"],
  surfaces: ["default", "muted", "brand", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose:
      "The newest posts of one of the site's blogs, with links to each. On the blog's own page it shows every post, a page at a time",
    avoid: ["two that show the same blog on one page"],
  },
  changes:
    "Shows the posts of one blog, chosen in its settings, and as many as you choose. On the blog's own page it shows every post, a page at a time, and elsewhere links to the rest.",
  // Version 1 listed every post on the site, twelve at a time, before a site could have several blogs.
  migrate: (previous) => ({
    ...previous,
    collection: { $ref: "page", id: placeholderCollection },
    count: 12,
  }),
  placeholder,
  component: PostList,
});
