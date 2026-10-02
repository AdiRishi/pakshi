import type { Presentation } from "../presentation.ts";
import type stats from "./v2/index.tsx";

export default {
  name: "Stats",
  summary: "Big numbers with short labels.",
  hint: "Use two to six numbers you can stand behind, each with a short label.",
  order: 90,
  variants: {
    row: {
      label: "In a row",
      description: "Big numbers side by side, each with a fine line beside it.",
    },
    cards: { label: "In boxes", description: "Each number in a box of its own." },
    split: {
      label: "Heading beside",
      description: "The heading on one side and the numbers in a grid beside it.",
    },
  },
  lists: {
    stats: { singular: "number", plural: "numbers", titleField: "label" },
  },
  choices: {
    align: { options: { start: "Left", center: "Centered" }, layouts: ["row", "cards"] },
    background: { options: { full: "Full width", inset: "Inset panel" } },
  },
  fields: {
    kicker: { label: "Small line above the heading" },
    heading: { hint: "Say what this part is about" },
    headingRest: { label: "Rest of the heading", hint: "Carries on the heading in a softer color" },
    intro: { hint: "A sentence about where the numbers come from" },
    stats: { label: "Numbers" },
    "stats.value": { label: "Number", hint: "Like 48" },
    "stats.label": { hint: "What the number counts" },
    "stats.detail": { hint: "A few more words, if they help" },
  },
  needs: {
    split: ["heading"],
  },
} satisfies Presentation<typeof stats>;
