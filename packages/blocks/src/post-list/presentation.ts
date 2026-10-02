import type { Presentation } from "../presentation.ts";
import type postList from "./v2/index.tsx";

export default {
  name: "Blog posts",
  summary: "The newest posts from one of your blogs.",
  hint: "Choose the blog it shows. On that blog's own page it shows every post, a page at a time.",
  order: 140,
  variants: {
    list: { label: "List", description: "One post under another." },
    cards: {
      label: "Cards",
      description: "Posts side by side, each in a box with its cover photo.",
    },
  },
  fields: {
    heading: { hint: "Say what this part is about" },
    intro: { hint: "A sentence to introduce it" },
  },
} satisfies Presentation<typeof postList>;
