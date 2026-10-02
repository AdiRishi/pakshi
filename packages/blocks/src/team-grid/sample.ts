import type { BlockSample } from "../presentation.ts";
import type teamGrid from "./v1/index.tsx";

export default {
  variant: "four-columns",
  surface: "default",
  props: {
    heading: "Your mentors",
    intro:
      "Every mentor builds or repairs boats for a living. Each one looks after six students all week.",
  },
  slots: {
    people: [
      {
        type: "team-member",
        variant: "default",
        props: {
          photo: {
            $ref: "media",
            id: "med_sampleTom",
            alt: "Tom Penrose",
          },
          name: "Tom Penrose",
          role: "Boatbuilder and lead mentor",
          bio: "Tom has built wooden boats on this harbour for twenty years. He runs the morning workshops.",
        },
      },
      {
        type: "team-member",
        variant: "default",
        props: {
          photo: {
            $ref: "media",
            id: "med_sampleMei",
            alt: "Mei Chen",
          },
          name: "Mei Chen",
          role: "Sailmaker",
          bio: "Mei makes and mends sails in the loft above the boatshed. Ask her about knots.",
        },
      },
      {
        type: "team-member",
        variant: "default",
        props: {
          photo: {
            $ref: "media",
            id: "med_sampleDan",
            alt: "Dan Okafor",
          },
          name: "Dan Okafor",
          role: "Sailing instructor",
          bio: "Dan takes everyone out on the water in the afternoons, and keeps them safe.",
        },
      },
      {
        type: "team-member",
        variant: "default",
        props: {
          photo: {
            $ref: "media",
            id: "med_sampleAsha",
            alt: "Asha Patel",
          },
          name: "Asha Patel",
          role: "Kitchen",
          bio: "Asha cooks lunch for everyone, every day.",
        },
      },
    ],
  },
} satisfies BlockSample<typeof teamGrid>;
