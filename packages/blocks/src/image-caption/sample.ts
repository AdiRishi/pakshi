import type { BlockSample } from "../presentation.ts";
import type imageCaption from "./v1/index.tsx";

export default {
  variant: "wide",
  surface: "default",
  props: {
    image: {
      $ref: "media",
      id: "med_sampleHarbour",
      alt: "Two sailing boats on the harbour at sunset",
    },
    caption: "The last evening of the summer school. Both boats were built by students that week.",
    credit: "Photo: Ana Moreno",
  },
} satisfies BlockSample<typeof imageCaption>;
