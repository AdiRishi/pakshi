import type { BlockSample } from "../presentation.ts";
import type split from "./v2/index.tsx";

export default {
  variant: "standard",
  surface: "default",
  props: {
    kicker: "Mornings",
    heading: "On the workshop floor.",
    headingRest: "Every joint cut by hand, with a mentor beside you.",
    body: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Each morning starts with a short demonstration at the bench. Then you build your own version, with one mentor for every six students.",
            },
          ],
        },
      ],
    },
    points: [
      {
        id: "it_tools",
        icon: "hammer",
        title: "Tools provided",
        body: "Chisels, planes and saws, sharpened every evening.",
      },
      {
        id: "it_timber",
        icon: "tree-pine",
        title: "Local timber",
        body: "Larch and oak from woods along the estuary.",
      },
      {
        id: "it_small",
        icon: "users",
        title: "Small groups",
        body: "Six to a bench, so nobody waits for help.",
      },
      {
        id: "it_safe",
        icon: "shield-check",
        title: "Safety first",
        body: "Gloves, glasses and a first aider in every shed.",
      },
    ],
    actions: [
      {
        id: "it_programme",
        button: { label: "See the programme", link: { $ref: "page", id: "pg_programme" } },
      },
    ],
    image: {
      $ref: "media",
      id: "med_sampleHarbour",
      alt: "Two sailing boats on the harbour at sunset",
    },
    mediaSide: "alternate",
    verticalAlign: "center",
    frame: "plain",
    background: "full",
  },
} satisfies BlockSample<typeof split>;
