import type { Presentation } from "../presentation.ts";
import type formSection from "./v2/index.tsx";

export default {
  name: "Form",
  summary: "A form people fill in, or a sign-up band.",
  hint: "Use one form on a page. Its questions are changed in Site settings, under Forms.",
  order: 160,
  variants: {
    split: {
      label: "Words beside",
      description: "The heading, points and a note on the left, the form in a box on the right.",
    },
    card: {
      label: "In a box",
      description: "The heading on top, with the form in a box in the middle.",
    },
    inline: {
      label: "Sign-up band",
      description:
        "The heading on the left and the form in one row on the right. Shows only short answers.",
    },
  },
  lists: {
    points: { singular: "point", plural: "points", titleField: "point" },
  },
  choices: {
    background: { options: { full: "Full width", inset: "Inset panel" } },
  },
  fields: {
    kicker: { label: "Small line above the heading" },
    heading: { hint: "Say what this part is about" },
    headingRest: { label: "Rest of the heading", hint: "Carries on the heading in a softer color" },
    intro: { hint: "A sentence to introduce it" },
    points: { hint: "Shown beside the form, in the Words beside layout" },
    "points.point": { hint: "Like what happens after they send it" },
    note: { hint: "Like who to ask, or how often you'll email" },
  },
} satisfies Presentation<typeof formSection>;
