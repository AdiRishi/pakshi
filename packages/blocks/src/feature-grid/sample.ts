import type { BlockSample } from "../presentation.ts";
import type featureGrid from "./v1/index.tsx";

export default {
  variant: "three-columns",
  surface: "default",
  props: {
    heading: "What's included",
    intro: "Everything you need for five days on the harbour.",
  },
  slots: {
    items: [
      {
        type: "feature-item",
        variant: "default",
        props: {
          title: "Workshops",
          body: "Two hands-on sessions a day, led by people who build boats for a living.",
        },
      },
      {
        type: "feature-item",
        variant: "default",
        props: {
          title: "Mentors",
          body: "One mentor for every six students, all week.",
        },
      },
      {
        type: "feature-item",
        variant: "default",
        props: {
          title: "Lunch",
          body: "A hot lunch every day. Vegetarian and vegan options.",
        },
      },
    ],
  },
} satisfies BlockSample<typeof featureGrid>;
