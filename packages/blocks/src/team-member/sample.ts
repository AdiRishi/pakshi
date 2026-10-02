import type { BlockSample } from "../presentation.ts";
import type teamMember from "./v2/index.tsx";

export default {
  variant: "default",
  props: {
    image: {
      $ref: "media",
      id: "med_sampleTom",
      alt: "Tom Penrose",
    },
    name: "Tom Penrose",
    role: "Boatbuilder and lead mentor",
    bio: "Tom has built wooden boats on this harbour for twenty years. He runs the morning workshops.",
    link: { $ref: "page", id: "pg_programme" },
  },
} satisfies BlockSample<typeof teamMember>;
