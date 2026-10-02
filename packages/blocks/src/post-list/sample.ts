import type { BlockSample } from "../presentation.ts";
import type postList from "./v3/index.tsx";

export default {
  variant: "cards",
  surface: "default",
  props: {
    kicker: "News",
    heading: "From the harbour",
    collection: {
      $ref: "page",
      id: "pg_news",
    },
    count: 3,
    columns: "3",
  },
} satisfies BlockSample<typeof postList>;
