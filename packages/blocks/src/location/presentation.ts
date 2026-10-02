import type { Presentation } from "../presentation.ts";
import type location from "./v1/index.tsx";

export default {
  name: "Location",
  summary: "Where a place is and how to get there.",
  hint: "Use one for each place, with a map or photo that helps people find it.",
  order: 170,
  variants: {
    "image-left": {
      label: "Map on the left",
      description: "The map or photo on the left, the address on the right.",
    },
    "image-right": {
      label: "Map on the right",
      description: "The address on the left, the map or photo on the right.",
    },
  },
  fields: {
    heading: { hint: "Say what this part is about" },
    address: { hint: "The address, one part to a line" },
    directions: { hint: "Like the nearest station or where to park" },
  },
  needs: {
    "image-left": ["map"],
    "image-right": ["map"],
  },
} satisfies Presentation<typeof location>;
