import type { Presentation } from "../presentation.ts";
import type quote from "./v2/index.tsx";

export default {
  name: "Testimonial",
  summary: "Words from one person, with their name.",
  hint: "Use someone's own words, with their name. If you have several, use Testimonials instead.",
  order: 80,
  variants: {
    centered: {
      label: "Words in the middle",
      description: "A large quote in the middle, with a small photo beside the name.",
    },
    split: {
      label: "Beside a photo",
      description: "A portrait on one side of a card and the quote on the other.",
    },
    panel: {
      label: "Colored panel",
      description:
        "The quote on a rounded panel in the section's color, with a logo above it. Pick a color for the background.",
    },
  },
  choices: {
    mediaSide: { options: { start: "Photo left", end: "Photo right" }, layouts: ["split"] },
  },
  fields: {
    quote: { hint: "Their words, as they said them, without quote marks" },
    name: { hint: "Who said it" },
    role: { hint: "Like Student, summer 2026" },
    image: { label: "Photo", hint: "A photo of the person quoted" },
    logo: { hint: "The logo of the organisation they're from" },
  },
  needs: {
    split: ["image"],
  },
} satisfies Presentation<typeof quote>;
