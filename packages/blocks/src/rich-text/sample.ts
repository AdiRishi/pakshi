import type { BlockSample } from "../presentation.ts";
import type richText from "./v1/index.tsx";

export default {
  variant: "narrow",
  surface: "default",
  props: {
    heading: "What you'll do",
    body: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Each day starts with a short talk, then moves to the workshop floor. You'll work in ",
            },
            {
              type: "text",
              text: "small teams",
              marks: [
                {
                  type: "bold",
                },
              ],
            },
            {
              type: "text",
              text: " with a mentor who has built the thing before.",
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
              text: "Bring with you",
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
                      text: "Clothes that can get wet",
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
                      text: "A packed lunch",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Questions? Read the ",
            },
            {
              type: "text",
              text: "frequently asked questions",
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: "https://example.org/questions",
                  },
                },
              ],
            },
            {
              type: "text",
              text: ".",
            },
          ],
        },
      ],
    },
  },
} satisfies BlockSample<typeof richText>;
