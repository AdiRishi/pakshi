import type { BlockSample } from "../presentation.ts";
import type hero from "./v4/index.tsx";

export default {
  variant: "stacked",
  surface: "default",
  props: {
    badge: "Applications open for 2027",
    badgeLink: { $ref: "page", id: "pg_programme" },
    heading: "Learn to build boats.",
    headingRest: "Five days on the harbour.",
    actions: [
      { id: "it_register", button: { label: "Register", link: "https://example.org/register" } },
      {
        id: "it_programme",
        button: { label: "See the programme", link: { $ref: "page", id: "pg_programme" } },
      },
    ],
    points: [
      { id: "it_beginners", point: "No experience needed" },
      { id: "it_lunch", point: "Lunch every day" },
      { id: "it_tools", point: "Tools provided" },
    ],
    image: {
      $ref: "media",
      id: "med_sampleHarbour",
      alt: "Two sailing boats on the harbour at sunset",
    },
    align: "center",
    mediaSide: "end",
    height: "auto",
    frame: "framed",
    backdrop: "glow",
  },
} satisfies BlockSample<typeof hero>;
