import type { BlockSample } from "../presentation.ts";
import type location from "./v1/index.tsx";

export default {
  variant: "image-left",
  surface: "default",
  props: {
    heading: "Getting to the harbour",
    address: "Harbour Summer School\nThe Boatshed, North Quay\nPortlow PL12 3AB",
    map: {
      $ref: "media",
      id: "med_sampleMap",
      alt: "A map of North Quay, with the boatshed marked",
    },
    directions:
      "The boatshed is a ten-minute walk from Portlow station. Follow the signs to the quay.",
    link: {
      label: "Get directions",
      link: "https://example.org/directions",
    },
  },
} satisfies BlockSample<typeof location>;
