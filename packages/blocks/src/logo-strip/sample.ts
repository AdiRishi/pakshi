import type { BlockSample } from "../presentation.ts";
import type logoStrip from "./v1/index.tsx";

export default {
  variant: "row",
  surface: "default",
  props: {
    heading: "Supported by",
    logos: [
      {
        id: "it_trust",
        logo: {
          $ref: "media",
          id: "med_sampleHarbourTrust",
          alt: "Westbay Harbour Trust",
        },
        link: "https://example.org/harbour-trust",
      },
      {
        id: "it_rowing",
        logo: {
          $ref: "media",
          id: "med_sampleRowingClub",
          alt: "Westbay Rowing Club",
        },
      },
      {
        id: "it_boatyard",
        logo: {
          $ref: "media",
          id: "med_sampleBoatyard",
          alt: "North Quay Boatyard",
        },
      },
      {
        id: "it_arts",
        logo: {
          $ref: "media",
          id: "med_sampleArtsCouncil",
          alt: "County Arts Council",
        },
      },
    ],
  },
} satisfies BlockSample<typeof logoStrip>;
