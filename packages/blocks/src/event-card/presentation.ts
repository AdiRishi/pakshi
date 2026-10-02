import type { Presentation } from "../presentation.ts";
import type eventCard from "./v1/index.tsx";

export default {
  name: "Event",
  summary: "One event: when, what and where.",
  hint: "Say when, what and where, with a sentence about it.",
  item: { singular: "event", plural: "events", titleField: "title" },
  variants: {
    default: {
      label: "Standard",
      description: "The date and title, with the place and a sentence about it.",
    },
  },
  fields: {
    date: { hint: "Like Sat 5 July, 10am" },
    title: { hint: "What's happening" },
    place: { hint: "Where it happens" },
    summary: { hint: "A sentence or two" },
    image: { label: "Photo" },
  },
} satisfies Presentation<typeof eventCard>;
