import type { Presentation } from "../presentation.ts";
import type card from "./v1/index.tsx";

export default {
  name: "Card",
  summary: "One card that leads to another page.",
  hint: "Give it a short title, a line about where it leads, and a picture or an icon.",
  item: { singular: "card", plural: "cards", titleField: "title" },
  variants: {
    default: {
      label: "Standard",
      description: "A picture or icon, a title and a line of text, linking to a page.",
    },
  },
  fields: {
    image: { label: "Picture" },
    icon: { hint: "Shown in rows and tiles, or where there's no picture" },
    kicker: { label: "Small line above the title", hint: "Like Visit or Free" },
    title: { hint: "A few words, like Getting here" },
    text: { hint: "A line about what's there" },
    link: { label: "Goes to", hint: "The page the card opens" },
  },
} satisfies Presentation<typeof card>;
