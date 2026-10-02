import type { BlockSample } from "../presentation.ts";
import type postList from "./v1/index.tsx";

export default {
  variant: "list",
  surface: "default",
  props: {
    heading: "From the blog",
  },
} satisfies BlockSample<typeof postList>;
