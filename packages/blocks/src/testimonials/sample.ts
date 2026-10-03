import type { BlockSample } from "../presentation.ts";
import type testimonials from "./v1/index.tsx";

export default {
  variant: "grid",
  surface: "default",
  props: {
    actions: [
      {
        id: "it_stories",
        button: {
          label: "Read more stories",
          link: {
            $ref: "page",
            id: "pg_news",
          },
        },
      },
    ],
    columns: "3",
    style: "cards",
    align: "start",
    kicker: "Students and parents",
    heading: "In their words.",
    headingRest: "What a week at the harbour is like, from the people who spent it there.",
  },
  slots: {
    items: [
      {
        type: "testimonial",
        variant: "default",
        props: {
          quote:
            "I'd never held a chisel before. By Friday I'd built a boat that floats, and I rowed it across the harbour myself.",
          name: "Priya Shah",
          role: "Student, summer 2026",
          avatar: {
            $ref: "media",
            id: "med_samplePriya",
            alt: "Priya Shah",
          },
        },
      },
      {
        type: "testimonial",
        variant: "default",
        props: {
          quote:
            "The mentors never did it for you. They showed you once, then let you get it wrong until you got it right.",
          name: "Dan Okafor",
          role: "Student, summer 2026",
          avatar: {
            $ref: "media",
            id: "med_sampleDan",
            alt: "Dan Okafor",
          },
        },
      },
      {
        type: "testimonial",
        variant: "default",
        props: {
          quote:
            "Our daughter came home sunburnt, smelling of varnish and talking about nothing but clinker planking. The best week of her summer, by a long way.",
          name: "Mei Chen",
          role: "Parent",
          avatar: {
            $ref: "media",
            id: "med_sampleMei",
            alt: "Mei Chen",
          },
        },
      },
      {
        type: "testimonial",
        variant: "default",
        props: {
          quote:
            "Our apprentices learned more in five days on the slipway than in a term of drawings.",
          name: "Tom Penrose",
          role: "Yard manager, North Quay Boatyard",
          logo: {
            $ref: "media",
            id: "med_sampleBoatyard",
            alt: "North Quay Boatyard",
          },
        },
      },
      {
        type: "testimonial",
        variant: "default",
        props: {
          quote:
            "The summer school has brought young people back to the harbour. You hear them on the slipway every July, arguing about knots.",
          name: "Asha Patel",
          role: "Chair, Westbay Harbour Trust",
          avatar: {
            $ref: "media",
            id: "med_sampleAsha",
            alt: "Asha Patel",
          },
          logo: {
            $ref: "media",
            id: "med_sampleHarbourTrust",
            alt: "Westbay Harbour Trust",
          },
        },
      },
      {
        type: "testimonial",
        variant: "default",
        props: {
          quote: "Small groups, proper tools and lunch on the quay. I've signed up again.",
          name: "Sam Taylor",
          role: "Student, summer 2025",
        },
      },
    ],
  },
} satisfies BlockSample<typeof testimonials>;
