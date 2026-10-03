import type { Presentation } from "../presentation.ts";
import type pricing from "./v1/index.tsx";

export default {
  name: "Pricing",
  summary: "Prices to choose between, such as tickets, memberships or plans.",
  hint: "Use two to four plans, each with a short list of what's included. Make one stand out at most.",
  order: 145,
  variants: {
    cards: {
      label: "Cards side by side",
      description: "Each plan on a card, side by side, so they're easy to compare.",
    },
    rows: {
      label: "One under another",
      description:
        "Each plan as a row, with its price and button at the end. Good for ticket types.",
    },
  },
  choices: {
    align: { options: { center: "Centered", start: "Left" } },
  },
  fields: {
    kicker: { label: "Small line above the heading", hint: "Like Summer 2027" },
    heading: { hint: "Say what this part is about" },
    headingRest: { label: "Rest of the heading", hint: "Carries on the heading in a softer color" },
    intro: { hint: "A sentence to introduce it" },
    note: {
      label: "Note under the plans",
      hint: "Anything that applies to every plan, like help with paying",
    },
  },
} satisfies Presentation<typeof pricing>;
