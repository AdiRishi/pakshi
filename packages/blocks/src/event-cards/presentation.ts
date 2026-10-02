import type { Presentation } from "../presentation.ts";
import type eventCards from "./v1/index.tsx";

export default {
  name: "Events",
  summary: "Upcoming events, with dates and places.",
  hint: "List events that haven't happened yet, each with its date, time and place.",
  order: 120,
  variants: {
    grid: { label: "Cards", description: "Events side by side, three to a row." },
    list: { label: "List", description: "One event under another." },
  },
  fields: {
    heading: { hint: "Say what this part is about" },
    intro: { hint: "A sentence to introduce it" },
  },
} satisfies Presentation<typeof eventCards>;
