import type { Presentation } from "../presentation.ts";
import type logoStrip from "./v1/index.tsx";

export default {
  name: "Logos",
  summary: "Logos of partners or sponsors.",
  hint: "Use each organisation's own logo, and describe it with the organisation's name.",
  order: 110,
  variants: {
    row: { label: "In a row", description: "Logos side by side, centred." },
    grid: { label: "In a grid", description: "Logos in an even grid." },
  },
  lists: {
    logos: { singular: "logo", plural: "logos", titleField: "logo" },
  },
  fields: {
    heading: { hint: "Like Supported by" },
  },
} satisfies Presentation<typeof logoStrip>;
