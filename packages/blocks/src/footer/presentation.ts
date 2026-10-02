import type { Presentation } from "../presentation.ts";
import type footer from "./v1/index.tsx";

export default {
  name: "Footer",
  summary: "Name and links, at the bottom of every page.",
  hint: "Keep the note short. The links come from the footer menu, in Pages and menus.",
  order: 200,
  variants: {
    simple: { label: "Simple", description: "The name, note and links, one under another." },
    columns: {
      label: "Two columns",
      description: "The name and note on the left, the links on the right.",
    },
  },
  fields: {
    note: { hint: "Like who runs the site" },
  },
} satisfies Presentation<typeof footer>;
