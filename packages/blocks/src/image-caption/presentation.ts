import type { Presentation } from "../presentation.ts";
import type imageCaption from "./v2/index.tsx";

export default {
  name: "Image",
  summary: "One photo, with a line about it.",
  hint: "Use it for one photo worth a section of its own. For several, use a Gallery.",
  order: 60,
  variants: {
    text: {
      label: "As wide as text",
      description: "The photo lines up with a column of writing, for the middle of an article.",
    },
    wide: { label: "Wide", description: "The photo runs the width of the page's content." },
    full: {
      label: "Edge to edge",
      description: "The photo runs from one side of the screen to the other.",
    },
  },
  choices: {
    crop: {
      options: { original: "As taken", landscape: "Landscape", square: "Square" },
      layouts: ["text", "wide"],
    },
  },
  fields: {
    image: { label: "Photo" },
    caption: { hint: "What the photo shows" },
    credit: { hint: "Like Photo: Ana Moreno" },
  },
} satisfies Presentation<typeof imageCaption>;
