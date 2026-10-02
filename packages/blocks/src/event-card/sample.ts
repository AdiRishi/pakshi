import type { BlockSample } from "../presentation.ts";
import type eventCard from "./v1/index.tsx";

export default {
  variant: "default",
  props: {
    date: "Sat 5 July, 10am",
    title: "Open workshop",
    place: "The boat shed, North Quay",
    summary: "See this year's boats half-built and have a go with a plane and a spokeshave.",
  },
} satisfies BlockSample<typeof eventCard>;
