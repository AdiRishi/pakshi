import type { BlockSample } from "../presentation.ts";
import type quote from "./v2/index.tsx";

export default {
  variant: "split",
  surface: "muted",
  props: {
    quote:
      "I'd never held a chisel before. By Friday I'd built a boat that floats, and I rowed it across the harbour myself.",
    name: "Priya Shah",
    role: "Student, summer 2026",
    image: {
      $ref: "media",
      id: "med_samplePriya",
      alt: "Priya Shah",
    },
    logo: {
      $ref: "media",
      id: "med_sampleHarbourTrust",
      alt: "Westbay Harbour Trust",
    },
    mediaSide: "start",
  },
} satisfies BlockSample<typeof quote>;
