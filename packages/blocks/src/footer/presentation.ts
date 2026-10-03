import type { Presentation } from "../presentation.ts";
import type footer from "./v2/index.tsx";

export default {
  name: "Footer",
  summary: "Links, contact and small print, at the bottom of every page.",
  hint: "The columns come from the main menu and the row of links from the footer menu, in Pages and menus.",
  order: 200,
  variants: {
    columns: {
      label: "Columns",
      description: "Name, note and social links on the left, the menu in columns on the right.",
    },
    simple: { label: "Simple", description: "Everything in a row or two." },
    centered: { label: "Centered", description: "Everything stacked in the middle." },
    wordmark: {
      label: "Big name",
      description: "Like Columns, with the site's name set very large across the bottom.",
    },
  },
  lists: {
    social: { singular: "social link", plural: "social links", titleField: "link" },
  },
  fields: {
    note: { hint: "Like who runs the site, in a sentence" },
    "social.icon": { label: "Network" },
    "social.link": { label: "Profile address" },
    newsletterHeading: { hint: "Like News from the harbour, once a month" },
    newsletter: { hint: "A form with an email field" },
    legal: { hint: "Like © 2027 Harbour Schools" },
  },
} satisfies Presentation<typeof footer>;
