import type { BlockSample } from "../presentation.ts";
import type formSection from "./v1/index.tsx";

export default {
  variant: "card",
  surface: "default",
  props: {
    heading: "Register for summer school",
    intro: "Places are limited. We'll email you within two days to confirm.",
    form: {
      $ref: "form",
      id: "frm_register",
    },
  },
} satisfies BlockSample<typeof formSection>;
