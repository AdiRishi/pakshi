import type { Presentation } from "../presentation.ts";
import type timeline from "./v2/index.tsx";

export default {
  name: "Timeline",
  summary: "A schedule, or steps in order.",
  hint: "Use it for things that happen in order, like a day's schedule or the steps of a process. Give breaks an icon to set them apart.",
  order: 130,
  variants: {
    agenda: {
      label: "As a schedule",
      description: "Times on the left, then each session with who leads it and where.",
    },
    vertical: {
      label: "Down a line",
      description: "Each step on a line, with its date beside it. Good for days or stages.",
    },
    horizontal: {
      label: "Across the page",
      description: "A few steps side by side, joined by a line. Good for up to six.",
    },
  },
  lists: {
    actions: { singular: "button", plural: "buttons", titleField: "button" },
    entries: { singular: "step", plural: "steps", titleField: "title" },
  },
  fields: {
    kicker: { label: "Small line above the heading" },
    heading: { hint: "Say what this part is about" },
    headingRest: { label: "Rest of the heading", hint: "Carries on the heading in a softer color" },
    intro: { hint: "A sentence to introduce it" },
    entries: { label: "Steps" },
    "entries.when": { label: "Time or day", hint: "Like 9:00, Day 1 or 1 March" },
    "entries.title": { label: "What happens", hint: "What happens" },
    "entries.who": { label: "Who leads it", hint: "Like a speaker or teacher" },
    "entries.place": { label: "Where", hint: "Like a room or stage" },
    "entries.detail": { label: "More detail", hint: "A sentence or two" },
    "entries.icon": { hint: "Sets a break, such as lunch, apart from the rest" },
  },
} satisfies Presentation<typeof timeline>;
