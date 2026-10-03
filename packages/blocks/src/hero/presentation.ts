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
  lists: {
    actions: { singular: "button", plural: "buttons", titleField: "button" },
    points: { singular: "point", plural: "points", titleField: "point" },
    proofImages: { singular: "photo", plural: "photos", titleField: "photo" },
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
      options: { plain: "Plain", framed: "On a tray", browser: "Browser window", phone: "Phone" },
      layouts: ["stacked", "split", "editorial"],
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
    signup: {
      label: "Sign-up form",
      hint: "Shown in one row in place of the buttons, for an email sign-up",
    },
    proof: { hint: "Like Loved by 2,000 sailors since 2019" },
    "proofImages.photo": { hint: "A face of someone who came" },
    image: { label: "Photo" },
  },
  needs: {
    cover: ["image"],
    panel: ["image"],
  },
} satisfies Presentation<typeof hero>;
