import type { Presentation } from "../presentation.ts";
import type testimonial from "./v1/index.tsx";

export default {
  name: "Testimonial",
  summary: "One person's words, with their name.",
  hint: "Use someone's own words, as they said them, with their name and who they are.",
  item: { singular: "testimonial", plural: "testimonials", titleField: "name" },
  variants: {
    default: {
      label: "Standard",
      description: "Their words, with their name, role and photo underneath.",
    },
  },
  fields: {
    quote: { hint: "Their words, as they said them" },
    name: { hint: "Who said it" },
    role: { hint: "Like Student, summer 2026" },
    avatar: { hint: "A photo of the person quoted" },
    logo: { hint: "The logo of the organisation they're from" },
  },
} satisfies Presentation<typeof testimonial>;
