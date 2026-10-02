import type { Presentation } from "../presentation.ts";
import type featureGrid from "./v2/index.tsx";

export default {
  name: "Features",
  summary: "A few short points, side by side.",
  hint: "Use three to six features, each a short title and a sentence or two.",
  order: 50,
  variants: {
    grid: { label: "Grid", description: "The heading on top, with the features in rows under it." },
    split: {
      label: "Heading beside",
      description: "The heading on one side, staying in view, with the features beside it.",
    },
    list: {
      label: "Icons beside words",
      description: "Each feature's icon sits to the left of its words.",
    },
  },
  lists: {
    actions: { singular: "button", plural: "buttons", titleField: "button" },
  },
  choices: {
    columns: {
      options: { "3": "Three across", "2": "Two across", "4": "Four across" },
      layouts: ["grid", "list"],
    },
    align: { options: { start: "Left", center: "Centered" }, layouts: ["grid", "list"] },
    style: { options: { plain: "Plain", cards: "Cards", lines: "Lines above" } },
    background: { options: { full: "Full width", inset: "Inset panel" } },
  },
  fields: {
    kicker: { label: "Small line above the heading" },
    heading: { hint: "Say what this part is about" },
    headingRest: { label: "Rest of the heading", hint: "Carries on the heading in a softer color" },
    intro: { hint: "A sentence to introduce it" },
  },
} satisfies Presentation<typeof featureGrid>;
