import type { Presentation } from "../presentation.ts";
import type postHeader from "./v1/index.tsx";

export default {
  name: "Post header",
  summary: "The top of a blog post: its title, date and author.",
  hint: "Use one at the top of each post. Its words and photo come from the post's settings.",
  order: 25,
  variants: {
    simple: { label: "Words only", description: "The title, date, author and excerpt." },
    cover: {
      label: "With cover photo",
      description: "The same words, with the post's cover photo underneath.",
    },
  },
} satisfies Presentation<typeof postHeader>;
