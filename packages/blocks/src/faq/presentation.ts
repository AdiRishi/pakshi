import type { Presentation } from "../presentation.ts";
import type faq from "./v2/index.tsx";

export default {
  name: "FAQ",
  summary: "Frequently asked questions, each with a short answer.",
  hint: "Keep each answer to a few sentences, and say where people can ask anything else.",
  order: 150,
  variants: {
    accordion: {
      label: "Questions that open",
      description: "Each question opens to show its answer, with the first one open.",
    },
    split: {
      label: "Heading beside",
      description: "The heading on one side, staying in view, with the questions beside it.",
    },
    columns: {
      label: "Two columns",
      description: "Every answer showing, in two columns. Best for a few questions.",
    },
  },
  lists: {
    questions: { singular: "question", plural: "questions", titleField: "question" },
    actions: { singular: "button", plural: "buttons", titleField: "button" },
  },
  choices: {
    align: { options: { center: "Centered", start: "Left" }, layouts: ["accordion", "columns"] },
  },
  fields: {
    kicker: { label: "Small line above the heading" },
    heading: { hint: "Say what this part is about" },
    headingRest: { label: "Rest of the heading", hint: "Carries on the heading in a softer color" },
    intro: { hint: "A sentence to introduce it" },
    "questions.question": { hint: "Type a question people ask" },
    "questions.answer": { hint: "Type a short answer" },
    contact: {
      label: "Still have a question?",
      hint: "Like Still have a question? We reply within a day.",
    },
  },
} satisfies Presentation<typeof faq>;
