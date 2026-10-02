import type { BlockSample } from "../presentation.ts";
import type bentoTile from "./v1/index.tsx";

export default {
  variant: "default",
  props: {
    kicker: "Afternoons",
    title: "Sail what you built",
    body: "An instructor in every boat, and life jackets for everyone.",
    image: {
      $ref: "media",
      id: "med_sampleHarbour",
      alt: "Two sailing boats on the harbour at sunset",
    },
    link: { label: "How we keep you safe", link: { $ref: "page", id: "pg_programme" } },
    size: "tall",
    media: "bottom",
    tone: "tint",
  },
} satisfies BlockSample<typeof bentoTile>;
