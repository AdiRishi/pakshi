import type { Presentation } from "../presentation.ts";
import type header from "./v2/index.tsx";

export default {
  name: "Header",
  summary: "Logo and menu, at the top of every page.",
  hint: "Keep the menu short, and save the button for the one thing most visitors come to do.",
  order: 10,
  variants: {
    simple: {
      label: "Logo on the left",
      description: "Logo on the left, with the menu and button on the right.",
    },
    centered: {
      label: "Everything centred",
      description: "Logo in the middle, with the menu underneath.",
    },
  },
} satisfies Presentation<typeof header>;
