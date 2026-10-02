import type { Presentation } from "../presentation.ts";
import type featureItem from "./v2/index.tsx";

export default {
  name: "Feature",
  summary: "One feature: a short title and a sentence or two.",
  hint: "Keep it to a short title and a sentence or two. Give it an icon or a picture, not both.",
  item: { singular: "feature", plural: "features", titleField: "title" },
  variants: {
    default: { label: "Standard", description: "A title with a sentence or two underneath." },
  },
  fields: {
    icon: { hint: "A small picture that stands for the point" },
    image: { label: "Picture" },
    title: { hint: "A few words" },
    body: { hint: "A sentence or two" },
    link: { hint: "Where to find out more" },
  },
} satisfies Presentation<typeof featureItem>;
