import type { BlockSample } from "../presentation.ts";
import type pricing from "./v1/index.tsx";

export default {
  variant: "cards",
  surface: "default",
  props: {
    align: "center",
    kicker: "Prices",
    heading: "One week, three ways to come.",
    headingRest: "Every price includes tools, safety gear and lunch.",
    note: "Bursaries cover the full fee for some students. Ask about one when you book.",
  },
  slots: {
    plans: [
      {
        type: "pricing-plan",
        variant: "default",
        props: {
          name: "Taster day",
          price: "£85",
          period: "per person",
          description: "One day in the boatshed, to see if it's for you.",
          features: [
            {
              id: "it_feature1",
              feature: "A morning workshop",
            },
            {
              id: "it_feature2",
              feature: "An afternoon on the water",
            },
            {
              id: "it_feature3",
              feature: "Lunch on the quay",
            },
          ],
          button: {
            label: "Book a day",
            link: {
              $ref: "page",
              id: "pg_programme",
            },
          },
          featured: "no",
        },
      },
      {
        type: "pricing-plan",
        variant: "default",
        props: {
          name: "Full week",
          price: "£350",
          badge: "Most popular",
          period: "per person",
          description: "Five days of building and sailing, from first plank to first sail.",
          features: [
            {
              id: "it_feature4",
              feature: "Ten workshops with a mentor",
            },
            {
              id: "it_feature5",
              feature: "Every afternoon on the water",
            },
            {
              id: "it_feature6",
              feature: "Lunch every day",
            },
            {
              id: "it_feature7",
              feature: "Tools and safety gear",
            },
            {
              id: "it_feature8",
              feature: "A certificate to take home",
            },
          ],
          button: {
            label: "Book the week",
            link: {
              $ref: "page",
              id: "pg_programme",
            },
          },
          featured: "brand",
        },
      },
      {
        type: "pricing-plan",
        variant: "default",
        props: {
          name: "Week and a bed",
          price: "£520",
          period: "per person",
          description: "The full week, with four nights at the harbour inn.",
          features: [
            {
              id: "it_feature9",
              feature: "Everything in the full week",
            },
            {
              id: "it_feature10",
              feature: "Four nights' bed and breakfast",
            },
            {
              id: "it_feature11",
              feature: "Evening talks in the sail loft",
            },
          ],
          button: {
            label: "Book with a stay",
            link: {
              $ref: "page",
              id: "pg_programme",
            },
          },
          featured: "no",
        },
      },
    ],
  },
} satisfies BlockSample<typeof pricing>;
