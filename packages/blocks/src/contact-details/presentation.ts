import type { Presentation } from "../presentation.ts";
import type contactDetails from "./v2/index.tsx";

export default {
  name: "Contact",
  summary: "Email, phone, address and opening hours.",
  hint: "Give only the details people should use to reach you. Leave out any you don't want used.",
  order: 180,
  variants: {
    columns: {
      label: "Side by side",
      description: "Each way to reach you in a column of its own, with its icon.",
    },
    split: {
      label: "Heading beside",
      description: "The heading on the left, with the details listed on the right.",
    },
    cards: { label: "Cards", description: "Each way to reach you in a card of its own." },
  },
  lists: {
    actions: { singular: "button", plural: "buttons", titleField: "button" },
  },
  fields: {
    kicker: { label: "Small line above the heading" },
    heading: { hint: "Say what this part is about" },
    headingRest: { label: "Rest of the heading", hint: "Carries on the heading in a softer color" },
    intro: { hint: "Like how quickly you reply" },
    email: { label: "Email address" },
    phone: { label: "Phone number" },
    address: { hint: "The address, one part to a line" },
    hours: { hint: "Like Monday to Friday, 9am to 4pm" },
  },
} satisfies Presentation<typeof contactDetails>;
