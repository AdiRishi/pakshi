import type { Presentation } from "../presentation.ts";
import type steps from "./v1/index.tsx";

export default {
  name: "Steps",
  summary: "How something works, as numbered steps.",
  hint: "Use two to six steps in the order people take them, each a short title and a sentence or two.",
  order: 58,
  variants: {
    row: {
      label: "Steps across",
      description: "The steps side by side, with a line joining their numbers.",
    },
    list: {
      label: "Steps down",
      description: "The heading on one side, with the steps one under another beside it.",
    },
    cards: {
      label: "Cards",
      description: "Each step on a card, with a large number.",
    },
  },
  lists: {
    steps: { singular: "step", plural: "steps", titleField: "title" },
    actions: { singular: "button", plural: "buttons", titleField: "button" },
  },
  choices: {
    align: { options: { start: "Left", center: "Centered" }, layouts: ["row", "cards"] },
  },
  fields: {
    kicker: { label: "Small line above the heading", hint: "Like How it works" },
    heading: { hint: "Say what this part is about" },
    headingRest: { label: "Rest of the heading", hint: "Carries on the heading in a softer color" },
    intro: { hint: "A sentence to introduce it" },
    "steps.title": { hint: "Like Book a place" },
    "steps.text": { hint: "A sentence or two" },
    "steps.icon": { hint: "A small picture beside the title, if it helps" },
  },
} satisfies Presentation<typeof steps>;
