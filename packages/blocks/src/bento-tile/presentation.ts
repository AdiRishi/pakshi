import type { Presentation } from "../presentation.ts";
import type bentoTile from "./v1/index.tsx";

export default {
  name: "Bento tile",
  summary: "One tile of a bento grid: a short title with a picture or an icon.",
  hint: "Keep it to a short title and a sentence. Give it a picture or an icon, and a size and color that suit how much it matters.",
  item: { singular: "tile", plural: "tiles", titleField: "title" },
  variants: {
    default: { label: "Standard", description: "A card with a title, and a picture or icon." },
  },
  choices: {
    size: {
      options: {
        small: "Small",
        wide: "Wide",
        tall: "Tall",
        large: "Large",
      },
    },
    media: {
      options: {
        bottom: "Under the words",
        top: "Above the words",
        cover: "Behind the words",
      },
    },
    tone: {
      options: {
        default: "Like the section",
        muted: "Soft",
        tint: "Tinted",
        brand: "Brand color",
        accent: "Second color",
        inverse: "Inverted",
      },
    },
  },
  fields: {
    kicker: { label: "Small line above the title" },
    title: { hint: "A few words" },
    body: { hint: "A sentence" },
    icon: { hint: "A small picture that stands for the point" },
    image: { label: "Picture" },
    link: { hint: "Where to find out more. The whole tile links there." },
  },
} satisfies Presentation<typeof bentoTile>;
