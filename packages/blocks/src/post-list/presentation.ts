import type { Presentation } from "../presentation.ts";
import type postList from "./v1/index.tsx";

export default {
  name: "Blog posts",
  summary: "Your newest blog posts.",
  hint: "Use one on a page. It lists your newest posts by itself.",
  order: 140,
  variants: {
    list: { label: "List", description: "One post under another." },
    cards: { label: "Cards", description: "Posts side by side, each in a box." },
  },
  fields: {
    heading: { hint: "Say what this part is about" },
    intro: { hint: "A sentence to introduce it" },
  },
} satisfies Presentation<typeof postList>;
