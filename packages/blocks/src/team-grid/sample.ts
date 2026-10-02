import type { BlockSample } from "../presentation.ts";
import type teamGrid from "./v2/index.tsx";

export default {
  variant: "grid",
  surface: "default",
  props: {
    kicker: "Mentors",
    heading: "Your mentors.",
    headingRest: "Every one of them builds or repairs boats for a living.",
    intro: "Each mentor looks after six students, all week, in the boatshed and on the water.",
    actions: [
      {
        id: "it_crew",
        button: { label: "Meet the whole crew", link: { $ref: "page", id: "pg_programme" } },
      },
    ],
    columns: "4",
    align: "start",
  },
  slots: {
    people: [
      {
        type: "team-member",
        variant: "default",
        props: {
          image: { $ref: "media", id: "med_sampleTom", alt: "Tom Penrose" },
          name: "Tom Penrose",
          role: "Boatbuilder and lead mentor",
          bio: "Tom has built wooden boats on this harbour for twenty years.",
          link: { $ref: "page", id: "pg_programme" },
        },
      },
      {
        type: "team-member",
        variant: "default",
        props: {
          image: { $ref: "media", id: "med_sampleMei", alt: "Mei Chen" },
          name: "Mei Chen",
          role: "Sailmaker",
          bio: "Mei makes and mends sails in the loft above the boatshed.",
        },
      },
      {
        type: "team-member",
        variant: "default",
        props: {
          image: { $ref: "media", id: "med_sampleDan", alt: "Dan Okafor" },
          name: "Dan Okafor",
          role: "Sailing instructor",
          bio: "Dan takes everyone out on the water in the afternoons.",
        },
      },
      {
        type: "team-member",
        variant: "default",
        props: {
          image: { $ref: "media", id: "med_sampleAsha", alt: "Asha Patel" },
          name: "Asha Patel",
          role: "Cook",
          bio: "Asha cooks lunch for everyone, every day.",
        },
      },
    ],
  },
} satisfies BlockSample<typeof teamGrid>;
