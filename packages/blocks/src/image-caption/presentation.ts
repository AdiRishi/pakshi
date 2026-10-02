import type { Presentation } from "../presentation.ts";
import type imageCaption from "./v1/index.tsx";

export default {
  name: "Image",
  summary: "One photo, with a line about it.",
  hint: "Use it for one photo worth a section of its own. For several, use a Gallery.",
  order: 60,
  variants: {
    wide: { label: "Wide", description: "The photo fills most of the page's width." },
    narrow: { label: "Narrow", description: "A smaller photo, as wide as a column of text." },
  },
  fields: {
    image: { label: "Photo" },
    caption: { hint: "What the photo shows" },
    credit: { hint: "Like Photo: Ana Moreno" },
  },
} satisfies Presentation<typeof imageCaption>;
