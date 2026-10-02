import type { BlockSample } from "../presentation.ts";
import type gallery from "./v1/index.tsx";

export default {
  variant: "grid",
  surface: "default",
  props: {
    heading: "Last summer",
    images: [
      {
        id: "it_evening",
        image: {
          $ref: "media",
          id: "med_pakshiHills",
          alt: "Hills above the harbour at sunset",
        },
        caption: "The harbour on the last evening",
      },
      {
        id: "it_launch",
        image: {
          $ref: "media",
          id: "med_sampleHarbour",
          alt: "Two sailing boats on the harbour at sunset",
        },
        caption: "Launch day",
      },
      {
        id: "it_morning",
        image: {
          $ref: "media",
          id: "med_pakshiArch",
          alt: "An open doorway with the sea beyond",
        },
        caption: "Before the workshops open",
      },
    ],
  },
} satisfies BlockSample<typeof gallery>;
