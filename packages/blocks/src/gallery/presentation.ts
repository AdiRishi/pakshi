import type { Presentation } from "../presentation.ts";
import type gallery from "./v1/index.tsx";

export default {
  name: "Gallery",
  summary: "A set of photos.",
  hint: "Use it for several photos that belong together. For a single photo, use an Image.",
  order: 70,
  variants: {
    grid: { label: "Three across", description: "Photos in rows of three." },
    wide: { label: "Two across", description: "Bigger photos, two to a row." },
  },
  lists: {
    images: { singular: "photo", plural: "photos", titleField: "caption" },
  },
  fields: {
    heading: { hint: "Say what this part is about" },
    images: { label: "Photos" },
    "images.image": { label: "Photo" },
    "images.caption": { hint: "What the photo shows" },
  },
} satisfies Presentation<typeof gallery>;
