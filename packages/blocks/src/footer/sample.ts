import type { BlockSample } from "../presentation.ts";
import type footer from "./v1/index.tsx";

export default {
  variant: "columns",
  surface: "default",
  props: {
    note: "Harbour Schools runs summer school with the Harbour Sailing Trust.",
  },
} satisfies BlockSample<typeof footer>;
