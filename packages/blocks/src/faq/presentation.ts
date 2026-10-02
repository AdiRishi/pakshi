import type { Presentation } from "../presentation.ts";
import type faq from "./v1/index.tsx";

export default {
  name: "FAQ",
  summary: "Frequently asked questions, each with a short answer.",
  hint: "Keep each answer to a few sentences. If an answer needs more, use a Text block instead.",
  order: 150,
  variants: {
    list: { label: "One after another", description: "Each question with its answer underneath." },
    "two-columns": { label: "Two columns", description: "Questions side by side, in two columns." },
  },
  lists: {
    questions: { singular: "question", plural: "questions", titleField: "question" },
  },
  fields: {
    heading: { hint: "Say what this part is about" },
    intro: { hint: "A sentence to introduce it" },
    "questions.question": { hint: "Type a question people ask" },
    "questions.answer": { hint: "Type a short answer" },
  },
} satisfies Presentation<typeof faq>;
