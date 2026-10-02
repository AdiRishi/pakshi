import type { BlockSample } from "../presentation.ts";
import type postHeader from "./v2/index.tsx";

export default {
  variant: "cover",
  surface: "default",
  props: {},
} satisfies BlockSample<typeof postHeader>;
