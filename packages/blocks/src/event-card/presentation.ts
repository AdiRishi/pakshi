import type { Presentation } from "../presentation.ts";
import type eventCard from "./v2/index.tsx";

export default {
  name: "Event",
  summary: "One event: when, what and where.",
  hint: "Write the date with the month as a word, so it can show as a calendar date.",
  item: { singular: "event", plural: "events", titleField: "title" },
  variants: {
    default: {
      label: "Standard",
      description: "The date, time and place, with the event's title and a sentence about it.",
    },
  },
  fields: {
    date: { hint: "Like Sat 5 July, or Until 3 May 2027" },
    time: { hint: "Like 10am, or 6pm to 8pm" },
    place: { hint: "Where it happens" },
    title: { hint: "What's happening" },
    body: { hint: "A sentence about it" },
    image: { label: "Picture" },
    link: { hint: "Where to book or find out more" },
  },
} satisfies Presentation<typeof eventCard>;
