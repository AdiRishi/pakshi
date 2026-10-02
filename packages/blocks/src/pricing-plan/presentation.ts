import type { Presentation } from "../presentation.ts";
import type pricingPlan from "./v1/index.tsx";

export default {
  name: "Plan",
  summary: "One plan or ticket type: its name, price and what's included.",
  hint: "Keep the name short and list what's included in a few words per line.",
  item: { singular: "plan", plural: "plans", titleField: "name" },
  variants: {
    default: {
      label: "Standard",
      description: "The name, price and what's included, with a button to choose it.",
    },
  },
  lists: {
    features: { singular: "line", plural: "lines", titleField: "feature" },
  },
  choices: {
    featured: {
      options: { no: "No", brand: "In the brand color", inverse: "In a contrasting color" },
    },
  },
  fields: {
    name: { hint: "Like Full week" },
    badge: { hint: "A word or two that marks it out, like Most popular" },
    price: { hint: "Like £350, or Free" },
    period: { label: "Per", hint: "Like per person, or a month" },
    description: { hint: "Who it's for, in a sentence" },
    features: { label: "What's included" },
    "features.feature": { label: "Included", hint: "Like Lunch every day" },
  },
} satisfies Presentation<typeof pricingPlan>;
