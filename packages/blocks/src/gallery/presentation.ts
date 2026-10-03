import type { Presentation } from "../presentation.ts";
import type gallery from "./v2/index.tsx";

export default {
  name: "Gallery",
  summary: "A set of photos.",
  hint: "Use it for several photos that belong together. For a single photo, use an Image.",
  order: 70,
  variants: {
    grid: {
      label: "Grid",
      description: "Photos in even rows, all cropped to the same size. Each opens larger.",
    },
    mosaic: {
      label: "Mosaic",
      description: "The first photo large, with the others in smaller tiles beside it.",
    },
    masonry: {
      label: "Columns",
      description: "Photos in columns, each at its own height, as they were taken.",
    },
    scroller: {
      label: "Scrolling row",
      description: "One row of photos that people move through with its buttons or a swipe.",
    },
  },
  lists: {
    images: { singular: "photo", plural: "photos", titleField: "caption" },
  },
  choices: {
    columns: {
      options: { "3": "Three across", "2": "Two across", "4": "Four across" },
      layouts: ["grid", "masonry", "scroller"],
    },
    crop: {
      options: { landscape: "Landscape", square: "Square", portrait: "Portrait" },
      layouts: ["grid", "scroller"],
    },
  },
  fields: {
    kicker: { label: "Small line above the heading" },
    heading: { hint: "Say what these photos show" },
    headingRest: { label: "Rest of the heading", hint: "Carries on the heading in a softer color" },
    intro: { hint: "A sentence to introduce them" },
    images: { label: "Photos" },
    "images.image": { label: "Photo" },
    "images.caption": { hint: "What the photo shows" },
  },
} satisfies Presentation<typeof gallery>;
