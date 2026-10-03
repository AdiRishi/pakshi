import type { Presentation } from "../presentation.ts";
import type teamGrid from "./v2/index.tsx";

export default {
  name: "Team",
  summary: "People and what they do.",
  hint: "Use a photo of each person named, with their role. Keep any bio to a sentence or two.",
  order: 100,
  variants: {
    grid: {
      label: "Portraits",
      description: "A photo of each person, with their name and role under it.",
    },
    list: {
      label: "List",
      description: "One person to a row, with a small round photo and a sentence about them.",
    },
    overlay: {
      label: "Names over photos",
      description: "Tall portraits with each name, role and bio over the bottom of the photo.",
    },
  },
  lists: {
    actions: { singular: "button", plural: "buttons", titleField: "button" },
  },
  choices: {
    columns: {
      options: { "4": "Four across", "3": "Three across" },
      layouts: ["grid", "overlay"],
    },
    align: { options: { start: "Left", center: "Centered" }, layouts: ["grid", "overlay"] },
  },
  fields: {
    kicker: { label: "Small line above the heading" },
    heading: { hint: "Say what this part is about" },
    headingRest: { label: "Rest of the heading", hint: "Carries on the heading in a softer color" },
    intro: { hint: "A sentence to introduce them" },
  },
} satisfies Presentation<typeof teamGrid>;
