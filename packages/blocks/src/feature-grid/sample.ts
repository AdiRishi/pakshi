import type { BlockSample } from "../presentation.ts";
import type featureGrid from "./v2/index.tsx";

export default {
  variant: "grid",
  surface: "default",
  props: {
    kicker: "The week",
    heading: "What's included.",
    headingRest: "Everything you need for five days on the harbour.",
    actions: [
      {
        id: "it_programme",
        button: { label: "See the programme", link: { $ref: "page", id: "pg_programme" } },
      },
    ],
    columns: "3",
    align: "start",
    style: "plain",
    background: "full",
  },
  slots: {
    items: [
      {
        type: "feature-item",
        variant: "default",
        props: {
          title: "Workshops",
          body: "Two hands-on sessions a day, led by people who build boats for a living.",
          icon: "hammer",
        },
      },
      {
        type: "feature-item",
        variant: "default",
        props: {
          title: "Mentors",
          body: "One mentor for every six students, all week.",
          icon: "users",
        },
      },
      {
        type: "feature-item",
        variant: "default",
        props: {
          title: "Lunch",
          body: "A hot lunch every day. Vegetarian and vegan options.",
          icon: "utensils",
        },
      },
      {
        type: "feature-item",
        variant: "default",
        props: {
          title: "Tools",
          body: "Everything you need is in the boatshed. Bring old clothes.",
          icon: "wrench",
        },
      },
      {
        type: "feature-item",
        variant: "default",
        props: {
          title: "Time on the water",
          body: "Afternoons in boats you helped build, with an instructor.",
          icon: "sailboat",
        },
      },
      {
        type: "feature-item",
        variant: "default",
        props: {
          title: "A certificate",
          body: "Proof of the skills you learned, for your next course.",
          icon: "award",
        },
      },
    ],
  },
} satisfies BlockSample<typeof featureGrid>;
