import type { Presentation } from "../presentation.ts";
import type featureItem from "./v1/index.tsx";

export default {
  name: "Feature",
  summary: "One feature: a short title and a sentence or two.",
  hint: "Keep it to a short title and a sentence or two.",
  item: { singular: "feature", plural: "features", titleField: "title" },
  variants: {
    default: { label: "Standard", description: "A title with a sentence or two underneath." },
  },
  fields: {
    title: { hint: "A few words" },
    body: { hint: "A sentence or two" },
  },
} satisfies Presentation<typeof featureItem>;
