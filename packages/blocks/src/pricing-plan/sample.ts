import type { BlockSample } from "../presentation.ts";
import type pricingPlan from "./v1/index.tsx";

export default {
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
} satisfies BlockSample<typeof pricingPlan>;
