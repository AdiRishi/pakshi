import type { Presentation } from "../presentation.ts";
import type callToAction from "./v1/index.tsx";

export default {
  name: "Call to action",
  summary: "Asks visitors to do one thing, like sign up.",
  hint: "Ask for one thing, with the same main button as the hero.",
  order: 190,
  variants: {
    banner: { label: "Banner", description: "Your words on the left, the buttons on the right." },
    centered: { label: "In the middle", description: "Your words and the buttons in the middle." },
  },
  fields: {
    heading: { hint: "Say what this part is about" },
    body: { hint: "A sentence about why" },
  },
} satisfies Presentation<typeof callToAction>;
