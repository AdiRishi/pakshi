import type { BlockSample } from "../presentation.ts";
import type card from "./v1/index.tsx";

export default {
  variant: "default",
  props: {
    image: {
      $ref: "media",
      id: "med_sampleHarbour",
      alt: "Boats moored close to the quay",
    },
    kicker: "The week",
    title: "What happens each day",
    text: "Workshops in the morning, sailing in the afternoon.",
    link: {
      $ref: "page",
      id: "pg_programme",
    },
  },
} satisfies BlockSample<typeof card>;
