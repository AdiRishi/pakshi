import type { Presentation } from "../presentation.ts";
import type split from "./v2/index.tsx";

export default {
  name: "Image and text",
  summary: "Words beside a photo.",
  hint: "Use a few in a row to tell a story. Leave the photo side on Take turns and they zigzag down the page.",
  order: 40,
  variants: {
    standard: {
      label: "Side by side",
      description: "Your words and a photo side by side, inside the page's margins.",
    },
    bleed: {
      label: "Photo to the edge",
      description: "The photo fills half the screen, right to its edge, beside your words.",
    },
  },
  lists: {
    points: { singular: "point", plural: "points", titleField: "title" },
    actions: { singular: "button", plural: "buttons", titleField: "button" },
  },
  choices: {
    mediaSide: {
      options: { alternate: "Take turns", end: "Photo right", start: "Photo left" },
    },
    verticalAlign: { options: { center: "Middle", top: "Top" } },
    frame: {
      options: { plain: "Plain", framed: "On a tray", browser: "Browser window", phone: "Phone" },
      layouts: ["standard"],
    },
    background: { options: { full: "Full width", inset: "Inset panel" } },
  },
  fields: {
    kicker: { label: "Small line above the heading", hint: "Like Mornings" },
    heading: { hint: "Say what this part is about" },
    headingRest: { label: "Rest of the heading", hint: "Carries on the heading in a softer color" },
    body: { hint: "A few sentences, or a short list" },
    "points.icon": { hint: "A small picture that stands for the point" },
    "points.title": { hint: "A few words" },
    "points.body": { hint: "A sentence" },
    image: { label: "Photo" },
  },
} satisfies Presentation<typeof split>;
