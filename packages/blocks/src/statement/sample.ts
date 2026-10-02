import type { BlockSample } from "../presentation.ts";
import type statement from "./v1/index.tsx";

export default {
  variant: "start",
  surface: "default",
  props: {
    kicker: "Why we teach",
    heading: "Everyone should get to build something that floats.",
    headingRest:
      "Boatbuilding teaches patience, care and how to read the water. We keep the school small, the tools sharp and the fees low, so anyone over sixteen can spend a week finding that out.",
    name: "Mei Chen",
    role: "Founder, Harbour Summer School",
    link: { label: "Read our story", link: { $ref: "page", id: "pg_news" } },
    size: "large",
  },
} satisfies BlockSample<typeof statement>;
