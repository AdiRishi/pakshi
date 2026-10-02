import type { Presentation } from "../presentation.ts";
import type header from "./v3/index.tsx";

export default {
  name: "Header",
  summary: "Logo and menu, at the top of every page.",
  hint: "Keep the menu short, and save the button for the one thing most visitors come to do.",
  order: 10,
  variants: {
    standard: {
      label: "Logo on the left",
      description: "Logo on the left, with the menu and buttons on the right.",
    },
    "centered-menu": {
      label: "Menu in the middle",
      description: "Logo on the left, the menu in the middle and the buttons on the right.",
    },
    "centered-logo": {
      label: "Logo in the middle",
      description: "The menu on the left, the logo in the middle and the buttons on the right.",
    },
    floating: {
      label: "Floating bar",
      description: "Logo, menu and buttons in a rounded bar that floats a little below the top.",
    },
  },
  retiredVariants: {
    simple: {
      label: "Logo on the left",
      description: "Logo on the left, with the menu and button on the right.",
    },
    centered: {
      label: "Everything centered",
      description: "Logo in the middle, with the menu underneath.",
    },
  },
  choices: {
    position: {
      options: {
        static: "Scrolls away",
        sticky: "Stays in view",
        overlay: "Over the first section",
      },
    },
    bar: { options: { brand: "Brand color", inverse: "Reversed", accent: "Accent color" } },
  },
  fields: {
    cta: { label: "Button", hint: "The one thing most visitors come to do" },
    secondary: { label: "Second link", hint: "Like Sign in" },
    announcement: { hint: "A short piece of news across the top, like Applications are open" },
    announcementLink: { label: "Announcement goes to" },
  },
} satisfies Presentation<typeof header>;
