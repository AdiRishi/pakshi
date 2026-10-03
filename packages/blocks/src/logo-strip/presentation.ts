import type { Presentation } from "../presentation.ts";
import type logoStrip from "./v2/index.tsx";

export default {
  name: "Logos",
  summary: "Logos of partners or sponsors.",
  hint: "Use each organization's own logo, and describe it with the organization's name. In one color, every logo matches the background, light or dark.",
  order: 110,
  variants: {
    row: { label: "In a row", description: "A short caption, with the logos spread across a row." },
    grid: {
      label: "In a grid",
      description: "Each logo in a cell of its own, with fine lines between them.",
    },
    marquee: {
      label: "Moving row",
      description: "The logos slide slowly across the page in a loop. Best with four or more.",
    },
    split: {
      label: "Caption beside",
      description: "The caption on the left and the logos in a row on the right.",
    },
  },
  lists: {
    logos: { singular: "logo", plural: "logos", titleField: "logo" },
  },
  choices: {
    color: {
      options: { mono: "One color", original: "Their own colors" },
    },
  },
  fields: {
    heading: { label: "Caption", hint: "Like Supported by" },
    "logos.link": { label: "Goes to", hint: "The organization's website, if you want" },
  },
} satisfies Presentation<typeof logoStrip>;
