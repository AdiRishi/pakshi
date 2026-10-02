import type { Presentation } from "../presentation.ts";
import type contactDetails from "./v1/index.tsx";

export default {
  name: "Contact",
  summary: "Address, phone, email and opening hours.",
  hint: "Give only the details people should use to reach you.",
  order: 180,
  variants: {
    columns: { label: "Side by side", description: "Each detail in a column of its own." },
    stacked: { label: "One under another", description: "The details in a single column." },
  },
  fields: {
    heading: { hint: "Say what this part is about" },
    intro: { hint: "A sentence to introduce it" },
    address: { hint: "The address, one part to a line" },
    hours: { hint: "Like Monday to Friday, 9am to 4pm" },
  },
} satisfies Presentation<typeof contactDetails>;
