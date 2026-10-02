import type { BlockSample } from "../presentation.ts";
import type hero from "./v3/index.tsx";

export default {
  variant: "full-bleed",
  surface: "default",
  props: {
    kicker: "Summer 2027",
    heading: "Learn by building",
    body: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Mornings are for making. Afternoons are for trying what you made on the water.",
            },
          ],
        },
      ],
    },
    image: {
      $ref: "media",
      id: "med_sampleHarbour",
      alt: "Two sailing boats on the harbour at sunset",
    },
    actions: [
      {
        id: "it_register",
        button: {
          label: "Register",
          link: "https://example.org/register",
        },
      },
      {
        id: "it_programme",
        button: {
          label: "See the programme",
          link: {
            $ref: "page",
            id: "pg_programme",
          },
        },
      },
    ],
  },
} satisfies BlockSample<typeof hero>;
