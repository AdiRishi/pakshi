import type { BlockSample } from "../presentation.ts";
import type cards from "./v1/index.tsx";

export default {
  variant: "grid",
  surface: "default",
  props: {
    kicker: "Plan your week",
    heading: "Everything you need to know.",
    headingRest: "Before you arrive at the harbour.",
    actions: [
      {
        id: "it_programme",
        button: {
          label: "See the programme",
          link: {
            $ref: "page",
            id: "pg_programme",
          },
        },
      },
    ],
    columns: "3",
    crop: "landscape",
    rows: "lines",
  },
  slots: {
    cards: [
      {
        type: "card",
        variant: "default",
        props: {
          image: {
            $ref: "media",
            id: "med_sampleMap",
            alt: "A map of North Quay, with the boatshed marked",
          },
          kicker: "Visit",
          title: "Getting here",
          text: "The boatshed is at the end of North Quay, ten minutes' walk from the station.",
          link: {
            $ref: "page",
            id: "pg_programme",
          },
        },
      },
      {
        type: "card",
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
      },
      {
        type: "card",
        variant: "default",
        props: {
          image: {
            $ref: "media",
            id: "med_sampleMei",
            alt: "Mei Chen in the boatshed",
          },
          kicker: "People",
          title: "Meet the mentors",
          text: "Twelve boat builders from around the region.",
          link: {
            $ref: "page",
            id: "pg_news",
          },
        },
      },
    ],
  },
} satisfies BlockSample<typeof cards>;
