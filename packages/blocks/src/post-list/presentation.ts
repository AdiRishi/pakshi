import type { Presentation } from "../presentation.ts";
import type postList from "./v3/index.tsx";

export default {
  name: "Blog posts",
  summary: "The newest posts from one of your blogs.",
  hint: "Choose the blog it shows. On that blog's own page it shows every post, a page at a time.",
  order: 140,
  variants: {
    cards: {
      label: "Cards",
      description: "Posts side by side, each with its cover photo above its title.",
    },
    list: {
      label: "List",
      description: "One post under another, with the title on the left and the date on the right.",
    },
    featured: {
      label: "Newest first, large",
      description: "The newest post large beside its cover photo, with the rest underneath.",
    },
    text: {
      label: "Text cards",
      description: "Posts in boxes without photos, with the date at the top and a summary below.",
    },
  },
  choices: {
    columns: {
      options: { "3": "Three across", "2": "Two across" },
      layouts: ["cards", "featured", "text"],
    },
  },
  fields: {
    kicker: { label: "Small line above the heading" },
    heading: { hint: "Say what this part is about" },
    headingRest: { label: "Rest of the heading", hint: "Carries on the heading in a softer color" },
    intro: { hint: "A sentence to introduce it" },
  },
} satisfies Presentation<typeof postList>;
