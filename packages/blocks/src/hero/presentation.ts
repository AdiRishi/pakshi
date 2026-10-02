import type { Presentation } from "../presentation.ts";
import type hero from "./v3/index.tsx";

export default {
  name: "Hero",
  summary: "The big opening at the top of a page.",
  hint: "Use one at the very top of a page. Give it one main button, and at most one more.",
  order: 20,
  variants: {
    "full-bleed": {
      label: "Text over a photo",
      description: "Your words sit in a box on top of a big photo.",
    },
    centered: {
      label: "Text in the middle",
      description: "Your words in the middle, with a photo underneath if you want one.",
    },
    "split-image": {
      label: "Text beside a photo",
      description: "Your words on one side and a photo on the other.",
    },
  },
  lists: {
    actions: { singular: "button", plural: "buttons", titleField: "button" },
  },
  fields: {
    kicker: { label: "Small line above the heading", hint: "Like Summer 2027" },
    heading: { hint: "Say what this page is about" },
    body: { hint: "A sentence or two" },
    image: { label: "Photo" },
  },
  needs: {
    "full-bleed": ["image"],
  },
} satisfies Presentation<typeof hero>;
