import type { BlockSample } from "../presentation.ts";
import type featureItem from "./v2/index.tsx";

export default {
  variant: "default",
  props: {
    title: "Workshops",
    body: "Two hands-on sessions a day, led by people who build boats for a living.",
    icon: "hammer",
    link: {
      label: "See the workshops",
      link: {
        $ref: "page",
        id: "pg_programme",
      },
    },
  },
} satisfies BlockSample<typeof featureItem>;
