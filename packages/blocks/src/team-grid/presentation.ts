import type { Presentation } from "../presentation.ts";
import type teamGrid from "./v1/index.tsx";

export default {
  name: "Team",
  summary: "People and what they do.",
  hint: "Give each person their role and a sentence or two about them.",
  order: 100,
  variants: {
    "three-columns": {
      label: "Three across",
      description: "Three people to a row, with room for a sentence about each.",
    },
    "four-columns": {
      label: "Four across",
      description: "Four people to a row. Good for longer lists.",
    },
  },
  fields: {
    heading: { hint: "Say what this part is about" },
    intro: { hint: "A sentence to introduce it" },
  },
} satisfies Presentation<typeof teamGrid>;
