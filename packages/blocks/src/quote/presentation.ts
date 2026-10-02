import type { Presentation } from "../presentation.ts";
import type quote from "./v1/index.tsx";

export default {
  name: "Testimonial",
  summary: "Words from one person, with their name.",
  hint: "Use someone's own words, with their name. If you have several, pick the strongest.",
  order: 80,
  variants: {
    centered: {
      label: "Words in the middle",
      description: "The quote in the middle, with a small photo by the name if you want one.",
    },
    "with-photo": { label: "Beside a photo", description: "A large photo beside the quote." },
  },
  fields: {
    quote: { hint: "Their words, as they said them" },
    name: { hint: "Who said it" },
    role: { hint: "Like Student, summer 2026" },
  },
  needs: {
    "with-photo": ["photo"],
  },
} satisfies Presentation<typeof quote>;
