import type { BlockSample } from "../presentation.ts";
import type footer from "./v2/index.tsx";

export default {
  variant: "columns",
  surface: "inverse",
  props: {
    note: "Harbour Schools runs summer courses in boatbuilding, sailing and the crafts of the sea.",
    social: [
      { id: "it_instagram", icon: "instagram", link: "https://instagram.com/example" },
      { id: "it_youtube", icon: "youtube", link: "https://youtube.com/example" },
    ],
    legal: "© 2027 Harbour Schools. Registered charity 1234567.",
  },
} satisfies BlockSample<typeof footer>;
