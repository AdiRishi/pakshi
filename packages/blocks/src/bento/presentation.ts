import type { Presentation } from "../presentation.ts";
import type bento from "./v1/index.tsx";

export default {
  name: "Bento grid",
  summary: "Tiles of different sizes and colors, fitted together.",
  hint: "Use four to seven tiles. Make one large for the thing people come for, and color one or two at most.",
  order: 55,
  variants: {
    grid: {
      label: "Three across",
      description: "Tiles in three columns, each as wide or tall as you set it.",
    },
    showcase: {
      label: "Two across",
      description: "Bigger tiles in two columns, with more room for pictures.",
    },
  },
  lists: {
    actions: { singular: "button", plural: "buttons", titleField: "button" },
  },
  choices: {
    align: { options: { start: "Left", center: "Centered" } },
    background: { options: { full: "Full width", inset: "Inset panel" } },
  },
  fields: {
    kicker: { label: "Small line above the heading" },
    heading: { hint: "Say what this part is about" },
    headingRest: { label: "Rest of the heading", hint: "Carries on the heading in a softer color" },
    intro: { hint: "A sentence to introduce it" },
  },
} satisfies Presentation<typeof bento>;
