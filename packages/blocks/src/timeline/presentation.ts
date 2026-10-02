import type { Presentation } from "../presentation.ts";
import type timeline from "./v1/index.tsx";

export default {
  name: "Timeline",
  summary: "A schedule, or steps in order.",
  hint: "Use it for things that happen in order, like a day's schedule or the steps of a process.",
  order: 130,
  variants: {
    agenda: {
      label: "As a schedule",
      description: "Times on the left, what happens on the right.",
    },
    vertical: {
      label: "Down a line",
      description: "Each step on a line. Good for days or stages.",
    },
  },
  lists: {
    entries: { singular: "step", plural: "steps", titleField: "title" },
  },
  fields: {
    heading: { hint: "Say what this part is about" },
    intro: { hint: "A sentence to introduce it" },
    entries: { label: "Steps" },
    "entries.when": { label: "Time or day", hint: "Like 9:00 or Day 1" },
    "entries.title": { label: "What happens", hint: "What happens" },
    "entries.detail": { label: "More detail", hint: "A sentence or two" },
  },
} satisfies Presentation<typeof timeline>;
