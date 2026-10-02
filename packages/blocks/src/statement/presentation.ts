import type { Presentation } from "../presentation.ts";
import type statement from "./v1/index.tsx";

export default {
  name: "Statement",
  summary: "What you stand for, in a few sentences set very large.",
  hint: "Make the first sentence the one people remember, and keep the rest to two or three sentences.",
  order: 35,
  variants: {
    start: {
      label: "Left",
      description: "The statement runs from the left, like a page of a book.",
    },
    center: {
      label: "Centered",
      description: "The statement sits in the middle of the section.",
    },
  },
  choices: {
    size: { options: { large: "Large", huge: "Huge" } },
  },
  fields: {
    kicker: { label: "Small line above the statement", hint: "Like What we believe" },
    heading: {
      label: "First sentence",
      hint: "The one thing you want people to remember",
    },
    headingRest: {
      label: "The rest",
      hint: "Two or three sentences that explain it, in a softer color",
    },
    name: { hint: "Who says this, if it's one person" },
    role: { hint: "Like Founder" },
    link: { hint: "Where to read more" },
  },
} satisfies Presentation<typeof statement>;
