import type { BlockSample } from "../presentation.ts";
import type formSection from "./v2/index.tsx";

export default {
  variant: "split",
  surface: "default",
  props: {
    kicker: "Summer 2027",
    heading: "Register for summer school.",
    headingRest: "Places are limited to thirty-six a week.",
    points: [
      { id: "it_confirm", point: "We email you within two days to confirm" },
      { id: "it_deposit", point: "Pay the deposit only once your place is confirmed" },
      { id: "it_bursary", point: "Bursaries cover the full fee for a third of places" },
    ],
    note: "Questions first? Call the office on 01632 960432.",
    form: {
      $ref: "form",
      id: "frm_register",
    },
    background: "full",
  },
} satisfies BlockSample<typeof formSection>;
