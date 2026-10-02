import type { Presentation } from "../presentation.ts";
import type formSection from "./v1/index.tsx";

export default {
  name: "Form",
  summary: "A form people fill in.",
  hint: "Use one form on a page. Its questions are changed in Site settings, under Forms.",
  order: 160,
  variants: {
    card: { label: "In a box", description: "The form sits in a box, set apart from the page." },
    plain: { label: "On the page", description: "The form sits straight on the page." },
  },
  fields: {
    heading: { hint: "Say what this part is about" },
    intro: { hint: "A sentence to introduce it" },
  },
} satisfies Presentation<typeof formSection>;
