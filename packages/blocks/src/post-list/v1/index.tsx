import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Root, Text, usePosts } from "../../components.tsx";
import { optional, text } from "../../fields.ts";

const props = {
  heading: text({ title: "Heading", min: 3, max: 80 }),
  intro: optional(text({ title: "Introduction", max: 240, multiline: true })),
};

const shown = 12;

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const PostList = ({
  props: section,
  variant,
}: BlockComponentProps<typeof props, "list" | "cards">) => {
  const posts = usePosts().slice(0, shown);
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
        {posts.length === 0 ? (
          <p className="text-body text-muted-foreground">There are no posts yet.</p>
        ) : (
          <ul
            className={
              variant === "cards"
                ? "grid gap-6 sm:grid-cols-2"
                : "flex flex-col divide-y divide-border"
            }
          >
            {posts.map((post) => (
              <li
                key={post.id}
                className={
                  variant === "cards"
                    ? "flex flex-col gap-2 rounded-lg border border-border bg-card p-6 text-card-foreground"
                    : "flex flex-col gap-2 py-6"
                }
              >
                <h3 className="text-heading">
                  <a
                    className="hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    href={post.href}
                  >
                    {post.title}
                  </a>
                </h3>
                <p className="text-small text-muted-foreground">
                  <time dateTime={post.date}>{dateFormat.format(new Date(post.date))}</time>
                  {post.author && `, ${post.author}`}
                </p>
                {post.excerpt && <p className="text-body">{post.excerpt}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Root>
  );
};

export default defineBlock({
  type: "post-list",
  version: 1,
  title: "Blog list",
  placement: "section",
  props,
  variants: ["list", "cards"],
  surfaces: ["default", "muted", "brand", "inverse"],
  slots: {},
  interactive: false,
  agent: {
    purpose: "The site's newest blog posts, with links to each",
    avoid: ["more than one per page"],
  },
  component: PostList,
});
