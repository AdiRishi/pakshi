import type { Presentation } from "../presentation.ts";
import type cards from "./v1/index.tsx";

export default {
  name: "Cards",
  summary: "Cards that lead to other pages.",
  hint: "Use three to eight cards, each with a short title and a page to go to.",
  order: 52,
  variants: {
    grid: {
      label: "Grid",
      description: "Each card's picture on top, with its title and a line of text underneath.",
    },
    overlay: {
      label: "Words on pictures",
      description: "Each card's title sits on its picture, over a soft fade.",
    },
    list: {
      label: "Rows",
      description: "One card under another, with a small icon or picture and an arrow.",
    },
    tiles: {
      label: "Icon tiles",
      description: "Boxes with an icon, a title and a line of text.",
    },
  },
  lists: {
    actions: { singular: "button", plural: "buttons", titleField: "button" },
  },
  choices: {
    columns: { options: { "3": "Three across", "2": "Two across", "4": "Four across" } },
    crop: {
      options: { landscape: "Landscape", square: "Square", portrait: "Portrait" },
      layouts: ["grid", "overlay", "tiles"],
    },
    rows: {
      options: { lines: "Lines between", tiles: "Boxes" },
      layouts: ["list"],
    },
  },
  fields: {
    kicker: { label: "Small line above the heading" },
    heading: { hint: "Say where these cards lead, like Plan your visit" },
    headingRest: { label: "Rest of the heading", hint: "Carries on the heading in a softer color" },
    intro: { hint: "A sentence to introduce them" },
  },
} satisfies Presentation<typeof cards>;
