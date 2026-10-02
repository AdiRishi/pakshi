import type { BlockSample } from "../presentation.ts";
import type timeline from "./v1/index.tsx";

export default {
  variant: "agenda",
  surface: "default",
  props: {
    heading: "A day at the summer school",
    intro: "Every day follows the same pattern, so you always know what's next.",
    entries: [
      {
        id: "it_arrive",
        when: "9:00",
        title: "Arrive at the boatshed",
      },
      {
        id: "it_workshop",
        when: "9:30",
        title: "Morning workshop",
        detail: "A short demonstration, then you try it yourself with your mentor.",
      },
      {
        id: "it_lunch",
        when: "12:30",
        title: "Lunch on the quay",
      },
      {
        id: "it_water",
        when: "13:30",
        title: "Out on the water",
        detail:
          "Life jackets are provided. If the weather turns, we stay in and carry on building.",
      },
      {
        id: "it_pickup",
        when: "16:00",
        title: "Pick-up at the main gate",
      },
    ],
  },
} satisfies BlockSample<typeof timeline>;
