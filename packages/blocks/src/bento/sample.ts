import type { BlockSample } from "../presentation.ts";
import type bento from "./v1/index.tsx";

export default {
  variant: "grid",
  surface: "default",
  props: {
    kicker: "The summer school",
    heading: "Everything in one week.",
    headingRest: "Workshops, mentors, lunch and time on the water.",
    actions: [
      {
        id: "it_programme",
        button: { label: "See the programme", link: { $ref: "page", id: "pg_programme" } },
      },
    ],
    align: "start",
    background: "full",
  },
  slots: {
    tiles: [
      {
        type: "bento-tile",
        variant: "default",
        props: {
          kicker: "The week",
          title: "Five days, one boat, and the tide to launch it on.",
          body: "Build a clinker dinghy from the keel up, then sail it on Friday.",
          image: {
            $ref: "media",
            id: "med_sampleHarbour",
            alt: "Two sailing boats on the harbour at sunset",
          },
          size: "large",
          media: "cover",
          tone: "inverse",
        },
      },
      {
        type: "bento-tile",
        variant: "default",
        props: {
          icon: "users",
          title: "One mentor for every six students",
          tone: "brand",
          size: "small",
          media: "bottom",
        },
      },
      {
        type: "bento-tile",
        variant: "default",
        props: {
          icon: "utensils",
          title: "Lunch on the quay",
          body: "Hot food every day, with vegetarian and vegan options.",
          size: "small",
          media: "bottom",
          tone: "default",
        },
      },
      {
        type: "bento-tile",
        variant: "default",
        props: {
          title: "Find us at North Quay",
          body: "Ten minutes on foot from the station, with parking by the slipway.",
          image: {
            $ref: "media",
            id: "med_sampleMap",
            alt: "A map of North Quay, with the boatshed marked",
          },
          link: { label: "Directions", link: { $ref: "page", id: "pg_programme" } },
          size: "wide",
          tone: "muted",
          media: "bottom",
        },
      },
      {
        type: "bento-tile",
        variant: "default",
        props: {
          icon: "award",
          title: "A certificate to keep",
          body: "Proof of the skills you learned.",
          tone: "tint",
          size: "small",
          media: "bottom",
        },
      },
    ],
  },
} satisfies BlockSample<typeof bento>;
