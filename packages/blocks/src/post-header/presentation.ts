import type { Presentation } from "../presentation.ts";
import type postHeader from "./v2/index.tsx";

export default {
  name: "Post header",
  summary: "The top of a blog post: its title, date and author.",
  hint: "Use one at the top of each post. Its words and photo come from the post's settings.",
  order: 25,
  variants: {
    simple: {
      label: "Words only",
      description: "The title, summary, date and author, lined up with the post's text.",
    },
    centered: {
      label: "Centered",
      description: "The title, summary, date and author in the middle of the page.",
    },
    cover: {
      label: "Cover photo below",
      description: "The words first, with the post's cover photo wide underneath.",
    },
    split: {
      label: "Cover photo beside",
      description: "The words on one side and the post's cover photo on the other.",
    },
  },
} satisfies Presentation<typeof postHeader>;
