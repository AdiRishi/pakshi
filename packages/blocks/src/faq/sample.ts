import type { BlockSample } from "../presentation.ts";
import type faq from "./v2/index.tsx";

export default {
  variant: "accordion",
  surface: "default",
  props: {
    kicker: "Before you book",
    heading: "Questions from parents",
    headingRest: "And the answers we give them.",
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
                  text: "Old clothes, sturdy shoes and a water bottle. ",
                },
                {
                  type: "text",
                  text: "We provide tools, safety gear and lunch.",
                  marks: [
                    {
                      type: "bold",
                    },
                  ],
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
        id: "it_bursary",
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
                      type: "italic",
                    },
                  ],
                },
                {
                  type: "text",
                  text: " cover the full fee for some students. ",
                },
                {
                  type: "text",
                  text: "Read about bursaries",
                  marks: [
                    {
                      type: "link",
                      attrs: {
                        href: "https://example.org/bursaries",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      {
        id: "it_medical",
        question: "My child has a medical condition. Can they come?",
        answer: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Usually, yes. Tell us when you book, and our first-aider will call you before the week starts to plan for it.",
                },
              ],
            },
          ],
        },
      },
      {
        id: "it_keep",
        question: "Can I keep my boat?",
        answer: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Yes. It's yours to take home, or you can give it to the harbour fleet for next year's students.",
                },
              ],
            },
          ],
        },
      },
    ],
    contact: "Still have a question? We reply within a day.",
    actions: [
      {
        id: "it_contact",
        button: {
          label: "Get in touch",
          link: "mailto:hello@example.org",
        },
      },
    ],
    align: "center",
  },
} satisfies BlockSample<typeof faq>;
