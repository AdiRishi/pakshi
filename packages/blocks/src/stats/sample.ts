import type { BlockSample } from "../presentation.ts";
import type stats from "./v2/index.tsx";

export default {
  variant: "row",
  surface: "default",
  props: {
    kicker: "2026",
    heading: "Last summer in numbers.",
    headingRest: "Five days, six boats, one harbour.",
    stats: [
      {
        id: "it_students",
        value: "48",
        label: "Students",
        detail: "From fourteen towns along the coast",
      },
      { id: "it_boats", value: "6", label: "Boats built and launched" },
      {
        id: "it_mentors",
        value: "11",
        label: "Mentors",
        detail: "From boatyards along the coast",
      },
      { id: "it_return", value: "94%", label: "Said they'd come back" },
    ],
    align: "start",
    background: "full",
  },
} satisfies BlockSample<typeof stats>;
