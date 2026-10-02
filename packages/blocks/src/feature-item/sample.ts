import type { BlockSample } from "../presentation.ts";
import type featureItem from "./v1/index.tsx";

export default {
  variant: "default",
  props: {
    title: "Workshops",
    body: "Two hands-on sessions a day, led by people who build boats for a living.",
  },
} satisfies BlockSample<typeof featureItem>;
