import type { BlockSample } from "../presentation.ts";
import type header from "./v3/index.tsx";

export default {
  variant: "standard",
  surface: "default",
  props: {
    cta: { label: "Register", link: "https://example.org/register" },
    secondary: { label: "Sign in", link: "https://example.org/sign-in" },
    position: "static",
    bar: "brand",
  },
} satisfies BlockSample<typeof header>;
