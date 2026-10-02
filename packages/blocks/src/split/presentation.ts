import type { Presentation } from "../presentation.ts";
import type split from "./v1/index.tsx";

export default {
  name: "Image and text",
  summary: "Words beside a photo.",
  hint: "When several follow each other, put the photo on alternate sides.",
  order: 40,
  variants: {
    "image-right": {
      label: "Photo on the right",
      description: "Your words on the left and a photo on the right.",
    },
    "image-left": {
      label: "Photo on the left",
      description: "A photo on the left and your words on the right.",
    },
  },
  fields: {
    heading: { hint: "Say what this part is about" },
    body: { hint: "A few sentences, or a short list" },
    image: { label: "Photo" },
  },
} satisfies Presentation<typeof split>;
