import type { BlockSample } from "../presentation.ts";
import type imageCaption from "./v2/index.tsx";

export default {
  variant: "wide",
  surface: "default",
  props: {
    image: {
      $ref: "media",
      id: "med_sampleHarbour",
      alt: "Two sailing boats on a calm harbour at sunset",
    },
    caption:
      "The last evening of the summer school. Both boats were built by students that week, and launched from North Quay on the Friday tide.",
    credit: "Photo: Ana Moreno",
    crop: "original",
  },
} satisfies BlockSample<typeof imageCaption>;
