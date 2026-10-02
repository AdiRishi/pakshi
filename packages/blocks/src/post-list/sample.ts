import type { BlockSample } from "../presentation.ts";
import type postList from "./v2/index.tsx";

export default {
  variant: "cards",
  surface: "default",
  props: {
    heading: "From the blog",
    collection: { $ref: "page", id: "pg_news" },
    count: 3,
  },
} satisfies BlockSample<typeof postList>;
