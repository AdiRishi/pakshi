import type { Presentation } from "../presentation.ts";
import type stats from "./v1/index.tsx";

export default {
  name: "Stats",
  summary: "Big numbers with short labels.",
  hint: "Use two to six numbers you can stand behind, each with a short label.",
  order: 90,
  variants: {
    row: { label: "In a row", description: "Big numbers side by side." },
    cards: { label: "In boxes", description: "Each number in a box of its own." },
  },
  lists: {
    stats: { singular: "number", plural: "numbers", titleField: "label" },
  },
  fields: {
    heading: { hint: "Say what this part is about" },
    stats: { label: "Numbers" },
    "stats.value": { label: "Number", hint: "Like 48" },
    "stats.label": { hint: "What the number counts" },
  },
} satisfies Presentation<typeof stats>;
