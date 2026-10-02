import type { BlockSample } from "../presentation.ts";
import type imageCaption from "./v1/index.tsx";

export default {
  variant: "wide",
  surface: "default",
  props: {
    image: {
      $ref: "media",
      id: "med_pakshiSea",
      alt: "Two sailing boats on the water",
    },
    caption: "The last evening of the summer school. Both boats were built by students that week.",
    credit: "Photo: Ana Moreno",
  },
} satisfies BlockSample<typeof imageCaption>;
