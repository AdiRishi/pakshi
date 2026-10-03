import type { Presentation } from "../presentation.ts";
import type location from "./v2/index.tsx";

export default {
  name: "Location",
  summary: "Where a place is, when it's open and how to get there.",
  hint: "Use one for each place, with a map or photo that helps people find it.",
  order: 170,
  variants: {
    split: {
      label: "Map beside",
      description: "The map or photo on one side, the address, hours and directions on the other.",
    },
    stacked: {
      label: "Map below",
      description: "The address, hours and directions side by side, above a wide map.",
    },
  },
  lists: {
    hours: { singular: "row of hours", plural: "rows of hours", titleField: "days" },
    actions: { singular: "button", plural: "buttons", titleField: "button" },
  },
  choices: {
    mediaSide: {
      options: { end: "Map on the right", start: "Map on the left" },
      layouts: ["split"],
    },
  },
  fields: {
    kicker: { label: "Small line above the heading" },
    heading: { hint: "Say what this part is about" },
    headingRest: { label: "Rest of the heading", hint: "Carries on the heading in a softer color" },
    intro: { hint: "A sentence to introduce it" },
    address: { hint: "The address, one part to a line" },
    "hours.days": { hint: "Like Monday to Friday" },
    "hours.times": { hint: "Like 9am to 5pm, or Closed" },
    directions: { label: "Directions", hint: "Like the nearest station or where to park" },
  },
  needs: {
    split: ["map"],
    stacked: ["map"],
  },
} satisfies Presentation<typeof location>;
