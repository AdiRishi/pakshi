import type { Presentation } from "../presentation.ts";
import type richText from "./v2/index.tsx";

export default {
  name: "Text",
  summary: "Longer writing, with headings and lists.",
  hint: "Break long writing up with headings and lists, so people can find what they need.",
  order: 30,
  variants: {
    article: {
      label: "Article",
      description: "One column in the middle of the page, set for easy reading.",
    },
    sidebar: {
      label: "Heading beside",
      description: "The heading on the left, staying in view, with the writing beside it.",
    },
  },
  fields: {
    kicker: { label: "Small line above the heading" },
    heading: { hint: "Say what this part is about" },
    headingRest: { label: "Rest of the heading", hint: "Carries on the heading in a softer color" },
    intro: { hint: "A sentence or two to introduce it" },
    body: { hint: "Write as much as you need" },
  },
  needs: {
    sidebar: ["heading"],
  },
} satisfies Presentation<typeof richText>;
