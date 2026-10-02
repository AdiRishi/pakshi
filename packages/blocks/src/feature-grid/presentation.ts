import type { Presentation } from "../presentation.ts";
import type featureGrid from "./v1/index.tsx";

export default {
  name: "Features",
  summary: "A few short points, side by side.",
  hint: "Use three to six features, each a short title and a sentence or two.",
  order: 50,
  variants: {
    "three-columns": { label: "Three across", description: "Three features to a row." },
    "two-columns": {
      label: "Two across",
      description: "Two features to a row, with more room for each.",
    },
  },
  fields: {
    heading: { hint: "Say what this part is about" },
    intro: { hint: "A sentence to introduce it" },
  },
} satisfies Presentation<typeof featureGrid>;
