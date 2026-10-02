import type { BlockSample } from "../presentation.ts";
import type faq from "./v1/index.tsx";

export default {
  variant: "list",
  surface: "default",
  props: {
    heading: "Questions from parents",
    questions: [
      {
        id: "it_bring",
        question: "What should my child bring?",
        answer: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Old clothes, sturdy shoes and a water bottle. We provide tools, safety gear and lunch.",
                },
              ],
            },
          ],
        },
      },
      {
        id: "it_swim",
        question: "Do they need to be able to swim?",
        answer: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Yes. Everyone who goes on the water must be able to swim 25 metres, and life jackets are worn at all times.",
                },
              ],
            },
          ],
        },
      },
      {
        id: "it_cost",
        question: "Is there help with the cost?",
        answer: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Yes. ",
                },
                {
                  type: "text",
                  text: "Bursaries",
                  marks: [
                    {
                      type: "link",
                      attrs: {
                        href: "https://example.org/bursaries",
                      },
                    },
                  ],
                },
                {
                  type: "text",
                  text: " cover the full fee for some students.",
                },
              ],
            },
          ],
        },
      },
    ],
  },
} satisfies BlockSample<typeof faq>;
