import type { BlockSample } from "../presentation.ts";
import type callToAction from "./v2/index.tsx";

export default {
  variant: "panel",
  surface: "brand",
  props: {
    kicker: "Places are limited",
    heading: "Spend a week on the water.",
    intro: "Registration closes on 30 November. Bursaries cover the fee for anyone under eighteen.",
    actions: [
      {
        id: "it_register",
        button: { label: "Register now", link: "https://example.org/register" },
      },
      {
        id: "it_bursary",
        button: { label: "About bursaries", link: { $ref: "page", id: "pg_programme" } },
      },
    ],
    image: {
      $ref: "media",
      id: "med_sampleHarbour",
      alt: "Two sailing boats on the harbour at sunset",
    },
    mediaSide: "end",
    backdrop: "none",
  },
} satisfies BlockSample<typeof callToAction>;
