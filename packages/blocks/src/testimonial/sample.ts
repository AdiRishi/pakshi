import type { BlockSample } from "../presentation.ts";
import type testimonial from "./v1/index.tsx";

export default {
  variant: "default",
  props: {
    quote:
      "I'd never held a chisel before. By Friday I'd built a boat that floats, and I rowed it across the harbour myself.",
    name: "Priya Shah",
    role: "Student, summer 2026",
    avatar: { $ref: "media", id: "med_samplePriya", alt: "Priya Shah" },
  },
} satisfies BlockSample<typeof testimonial>;
