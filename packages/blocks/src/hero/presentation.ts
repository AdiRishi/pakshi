import type { Presentation } from "../presentation.ts";
import type hero from "./v4/index.tsx";

export default {
  name: "Hero",
  summary: "The big opening at the top of a page.",
  hint: "Use one at the very top of a page. Give it one main button, and at most one more.",
  order: 20,
  variants: {
    stacked: {
      label: "Words over a picture",
      description: "Your words first, with a wide photo or screenshot underneath if you want one.",
    },
    split: {
      label: "Words beside a picture",
      description: "Your words on one side and a photo on the other.",
    },
    cover: {
      label: "Words on a photo",
      description: "A big photo fills the section, with your words on top of it.",
    },
    editorial: {
      label: "Big statement",
      description: "A very large heading, with the text and buttons in a row beneath it.",
    },
    panel: {
      label: "Half and half",
      description: "A photo fills one half, and your words sit on a block of color in the other.",
    },
  },
  retiredVariants: {
    centered: {
      label: "Text in the middle",
      description: "Your words in the middle, with a photo underneath if you want one.",
    },
    "split-image": {
      label: "Text beside a photo",
      description: "Your words on one side and a photo on the other.",
    },
    "full-bleed": {
      label: "Text over a photo",
      description: "Your words sit in a box on top of a big photo.",
    },
  },
  lists: {
    actions: { singular: "button", plural: "buttons", titleField: "button" },
    points: { singular: "point", plural: "points", titleField: "point" },
  },
  choices: {
    align: {
      options: { center: "Centered", start: "Left" },
      layouts: ["stacked", "cover"],
    },
    mediaSide: {
      options: { end: "Photo right", start: "Photo left" },
      layouts: ["split", "panel"],
    },
    height: {
      options: { auto: "Regular", tall: "Tall", screen: "Full screen" },
      layouts: ["cover", "panel"],
    },
    frame: {
      options: { plain: "Plain", framed: "Framed" },
      layouts: ["stacked", "split", "editorial"],
    },
    backdrop: {
      options: { none: "None", glow: "Glow", grid: "Grid", dots: "Dots" },
      layouts: ["stacked", "split", "editorial"],
    },
  },
  fields: {
    badge: {
      label: "Announcement",
      hint: "A short piece of news in a pill above the heading, like Applications open",
    },
    badgeLink: { label: "Announcement goes to" },
    kicker: { label: "Small line above the heading", hint: "Like Summer 2027" },
    heading: { hint: "Say what this page is about" },
    headingRest: {
      label: "Rest of the heading",
      hint: "Carries on the heading in a softer color",
    },
    body: { hint: "A sentence or two" },
    "points.point": { hint: "Like No experience needed" },
    image: { label: "Photo" },
  },
  needs: {
    cover: ["image"],
    panel: ["image"],
  },
} satisfies Presentation<typeof hero>;
