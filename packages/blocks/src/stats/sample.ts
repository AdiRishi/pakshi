import type { BlockSample } from "../presentation.ts";
import type stats from "./v1/index.tsx";

export default {
  variant: "row",
  surface: "default",
  props: {
    heading: "Last summer in numbers",
    stats: [
      {
        id: "it_students",
        value: "48",
        label: "Students",
      },
      {
        id: "it_boats",
        value: "6",
        label: "Boats built and launched",
      },
      {
        id: "it_mentors",
        value: "11",
        label: "Mentors from boatyards along the coast",
      },
      {
        id: "it_return",
        value: "94%",
        label: "Said they'd come back",
      },
    ],
  },
} satisfies BlockSample<typeof stats>;
