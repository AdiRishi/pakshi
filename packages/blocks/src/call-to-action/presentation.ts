import type { Presentation } from "../presentation.ts";
import type callToAction from "./v2/index.tsx";

export default {
  name: "Call to action",
  summary: "Asks visitors to do one thing, like sign up.",
  hint: "Ask for one thing, with the same main button as the hero, or a sign-up form.",
  order: 190,
  variants: {
    centered: {
      label: "In the middle",
      description: "Your words and the buttons in the middle of the section.",
    },
    split: {
      label: "Words and buttons",
      description: "Your words on the left and the buttons on the right.",
    },
    panel: {
      label: "Panel",
      description:
        "A rounded panel of color on the page, with a photo filling one side if you want.",
    },
    image: {
      label: "Words on a photo",
      description: "A photo fills the section, with your words and buttons on top of it.",
    },
  },
  lists: {
    actions: { singular: "button", plural: "buttons", titleField: "button" },
  },
  choices: {
    mediaSide: {
      options: { end: "Photo right", start: "Photo left" },
      layouts: ["panel"],
    },
    backdrop: {
      options: {
        none: "None",
        glow: "Glow",
        arc: "Rising glow",
        grid: "Grid",
        dots: "Dots",
        stripes: "Stripes",
        noise: "Grain",
      },
      layouts: ["centered", "split", "panel"],
    },
  },
  fields: {
    kicker: { label: "Small line above the heading", hint: "Like Places are limited" },
    heading: { hint: "Say what to do, like Come and build a boat" },
    headingRest: { label: "Rest of the heading", hint: "Carries on the heading in a softer color" },
    intro: { hint: "A sentence about why now" },
    form: {
      hint: "An email sign-up, shown in one row. With a form, the buttons become small links beside it.",
    },
    image: { label: "Photo" },
  },
  needs: {
    image: ["image"],
  },
} satisfies Presentation<typeof callToAction>;
