import type { Presentation } from "../presentation.ts";
import type richText from "./v1/index.tsx";

export default {
  name: "Text",
  summary: "Longer writing, with headings and lists.",
  hint: "Break long writing up with headings and lists, so people can find what they need.",
  order: 30,
  variants: {
    narrow: { label: "Narrow", description: "A narrow column that's easy to read." },
    wide: { label: "Wide", description: "A wider column that uses more of the page." },
  },
  fields: {
    heading: { hint: "Say what this part is about" },
    body: { hint: "Write as much as you need" },
  },
} satisfies Presentation<typeof richText>;
