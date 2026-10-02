import type { BlockSample } from "../presentation.ts";
import type header from "./v2/index.tsx";

export default {
  variant: "simple",
  surface: "default",
  props: {
    cta: {
      label: "Register",
      link: "https://example.org/register",
    },
  },
} satisfies BlockSample<typeof header>;
