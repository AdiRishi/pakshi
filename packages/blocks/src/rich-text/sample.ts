import type { BlockSample } from "../presentation.ts";
import type richText from "./v2/index.tsx";

export default {
  variant: "article",
  surface: "default",
  props: {
    kicker: "The week",
    heading: "A day at the boatshed",
    intro:
      "Five days, two workshops a day, and an afternoon on the water whenever the tide allows.",
    body: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Each day starts at eight with tea and a short talk on the slipway, then moves to the workshop floor. You'll work in ",
            },
            {
              type: "text",
              text: "small teams",
              marks: [
                {
                  type: "italic",
                },
              ],
            },
            {
              type: "text",
              text: " with a mentor who has built the boat in front of you at least once before.",
            },
          ],
        },
        {
          type: "heading",
          attrs: {
            level: 2,
          },
          content: [
            {
              type: "text",
              text: "Mornings: building",
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "The first two days are about wood. You'll learn to read the grain, sharpen a plane and cut a scarf joint that holds. By Wednesday each team is fitting planks to its own dinghy.",
            },
          ],
        },
        {
          type: "heading",
          attrs: {
            level: 3,
          },
          content: [
            {
              type: "text",
              text: "What you'll learn",
            },
          ],
        },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Lofting: drawing the boat full size on the floor",
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
                      text: "Steaming and bending oak frames",
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
                      text: "Planking, fastening and fairing the hull",
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
                      text: "Painting and varnishing for salt water",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "heading",
          attrs: {
            level: 2,
          },
          content: [
            {
              type: "text",
              text: "Afternoons: sailing",
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "After lunch, instructors from the Westbay Rowing Club take groups out in the school's fleet. Nobody needs to have sailed before. ",
            },
            {
              type: "text",
              text: "Everyone wears a buoyancy aid on the water",
              marks: [
                {
                  type: "bold",
                },
              ],
            },
            {
              type: "text",
              text: ", and we don't go out when the wind is over force four.",
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Read the ",
            },
            {
              type: "text",
              text: "full programme",
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: "https://example.org/programme",
                  },
                },
              ],
            },
            {
              type: "text",
              text: " for the times of each session.",
            },
          ],
        },
      ],
    },
  },
} satisfies BlockSample<typeof richText>;
