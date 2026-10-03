import type { BlockSample } from "../presentation.ts";
import type eventCard from "./v2/index.tsx";

export default {
  variant: "default",
  props: {
    date: "Sat 5 July",
    time: "10am to 4pm",
    place: "The boatshed, North Quay",
    title: "Open workshop",
    body: "See this year's boats half-built and have a go with a plane and a spokeshave.",
    image: {
      $ref: "media",
      id: "med_sampleHarbour",
      alt: "Two sailing boats on the harbour at sunset",
    },
    link: { label: "Plan your visit", link: { $ref: "page", id: "pg_programme" } },
  },
} satisfies BlockSample<typeof eventCard>;
