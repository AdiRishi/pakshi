import type { BlockSample } from "../presentation.ts";
import type split from "./v1/index.tsx";

export default {
  variant: "image-right",
  surface: "default",
  props: {
    heading: "Mornings on the workshop floor",
    body: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Every morning starts with a short demonstration, then you build your own version with a mentor beside you.",
            },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Tools and materials provided",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Groups of six at most",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    image: {
      $ref: "media",
      id: "med_pakshiArch",
      alt: "An open doorway with the sea beyond",
    },
    cta: {
      label: "See the programme",
      link: {
        $ref: "page",
        id: "pg_programme",
      },
    },
  },
} satisfies BlockSample<typeof split>;
