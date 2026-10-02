import type { BlockSample } from "../presentation.ts";
import type eventCards from "./v1/index.tsx";

export default {
  variant: "grid",
  surface: "default",
  props: {
    heading: "Summer events",
    intro: "Everyone's welcome at these, not just students.",
  },
  slots: {
    events: [
      {
        type: "event-card",
        variant: "default",
        props: {
          date: "Sat 5 July, 10am",
          title: "Open workshop",
          place: "The boat shed, North Quay",
          summary: "See this year's boats half-built and have a go with a plane and a spokeshave.",
          link: {
            label: "See the programme",
            link: {
              $ref: "page",
              id: "pg_programme",
            },
          },
        },
      },
      {
        type: "event-card",
        variant: "default",
        props: {
          date: "Fri 11 July, 4pm",
          title: "Launch day",
          place: "The slipway",
          summary:
            "Students put their boats in the water for the first time. Come and cheer them on.",
        },
      },
      {
        type: "event-card",
        variant: "default",
        props: {
          date: "Sat 19 July, 7pm",
          title: "Harbour supper",
          place: "The Net Loft",
          summary: "A shared supper to end the summer. Tickets include food and a drink.",
        },
      },
    ],
  },
} satisfies BlockSample<typeof eventCards>;
