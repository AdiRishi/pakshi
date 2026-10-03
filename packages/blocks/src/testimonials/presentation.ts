import type { Presentation } from "../presentation.ts";
import type testimonials from "./v1/index.tsx";

export default {
  name: "Testimonials",
  summary: "What several people say about you, side by side.",
  hint: "Use three or more people's own words, each with their name. For one quote on its own, use Testimonial.",
  order: 85,
  variants: {
    grid: {
      label: "Grid",
      description: "The heading on top, with the testimonials in even rows under it.",
    },
    masonry: {
      label: "Wall",
      description: "Testimonials of different lengths packed into columns, like a wall of notes.",
    },
    scroller: {
      label: "Scrolling row",
      description: "One row that people move through with its buttons or a swipe.",
    },
    marquee: {
      label: "Moving row",
      description: "One row that slowly slides by on its own. Best with five or more short ones.",
    },
  },
  lists: {
    actions: { singular: "button", plural: "buttons", titleField: "button" },
  },
  choices: {
    columns: {
      options: { "3": "Three across", "2": "Two across", "4": "Four across" },
      layouts: ["grid", "masonry", "scroller"],
    },
    style: { options: { cards: "Cards", plain: "Plain, with a line above" } },
    align: { options: { start: "Left", center: "Centered" } },
  },
  fields: {
    kicker: { label: "Small line above the heading" },
    heading: { hint: "Say what this part is about" },
    headingRest: { label: "Rest of the heading", hint: "Carries on the heading in a softer color" },
    intro: { hint: "A sentence to introduce it" },
  },
} satisfies Presentation<typeof testimonials>;
