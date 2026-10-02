import type { Presentation } from "../presentation.ts";
import type eventCards from "./v2/index.tsx";

export default {
  name: "Events",
  summary: "Upcoming events, with dates and places.",
  hint: "List events that haven't happened yet, each with its date, and its time and place if it has them.",
  order: 120,
  variants: {
    grid: {
      label: "Cards",
      description: "Events side by side, each with a picture, or its date large when it has none.",
    },
    list: {
      label: "List",
      description: "One event to a row, with its date large on the left. Good for many events.",
    },
  },
  lists: {
    actions: { singular: "button", plural: "buttons", titleField: "button" },
  },
  choices: {
    columns: { options: { "3": "Three across", "2": "Two across" }, layouts: ["grid"] },
  },
  fields: {
    kicker: { label: "Small line above the heading" },
    heading: { hint: "Say what this part is about" },
    headingRest: { label: "Rest of the heading", hint: "Carries on the heading in a softer color" },
    intro: { hint: "A sentence to introduce them" },
  },
} satisfies Presentation<typeof eventCards>;
